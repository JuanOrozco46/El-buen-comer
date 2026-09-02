import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";
import { sendWhatsAppMessage, normalizarNumero, sendWhatsAppMedia, sendTypingIndicator } from "../../../lib/whatsapp";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

/**
 * Normalizes a string by removing accents and converting to lowercase.
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Returns the exact delivery fee based on neighborhood / address.
 */
function getDeliveryFeeByAddress(address: string | null | undefined): number {
  if (!address) return 6000;
  const normalized = normalizeString(address);
  if (normalized.includes("recoger") || normalized.includes("local") || normalized.includes("lleva") || normalized.includes("retirar") || normalized.includes("paso por el")) {
    return 0;
  }

  // Precios por zonas
  const tier4 = ["rockefeller", "modelo", "maeugenia", "bellavista", "tamarindo", "juan 23", "porvenir", "eucaristico", "14 julio", "14 de julio"];
  const tier5 = ["cristal", "oriente", "transformadora", "galeon", "miraflores", "masamorra", "san luis", "kennedy", "el 5", "el cinco"];
  const tier6 = ["marina", "r9", "laureles", "inmaculada", "ciudadela 1", "ciudadela 2", "campin", "kilometro 5", "km 5", "centro"];
  const tier7 = ["ciudadela 3", "ciudadela 4", "pino", "12 abril", "12 de abril", "independencia", "bolivar", "grancolombia", "santa cruz", "isla", "cascajal"];
  const tier8 = ["exito", "triunfo", "nueva grana", "brisas"];
  const tier9 = ["colinas"];

  if (tier4.some(b => normalized.includes(b))) return 4000;
  if (tier5.some(b => normalized.includes(b))) return 5000;
  if (tier6.some(b => normalized.includes(b))) return 6000;
  if (tier7.some(b => normalized.includes(b))) return 7000;
  if (tier8.some(b => normalized.includes(b))) return 8000;
  if (tier9.some(b => normalized.includes(b))) return 9000;

  return 6000; // Barrio desconocido por defecto
}

/**
 * Generates a randomized response to notify the user that audio messages are not supported.
 * Highly varied to prevent WhatsApp spam reporting.
 */
function getAudioRejectionMessage(): string {
  const intros = [
    "¡Hola! Disculpa, por este medio no tengo la posibilidad de escuchar audios.",
    "Hola, qué pena contigo. No puedo procesar notas de voz por aquí.",
    "¡Hola! Qué pena, pero por ahora solo respondo a mensajes que sean de texto.",
    "Hola, un gusto saludarte. Te cuento que no me es posible reproducir mensajes de voz por acá.",
    "Hola, disculpa. La cocina y el sistema por ahora no reciben audios, solo mensajes escritos.",
    "¡Hola! Qué pena contigo pero por aquí no me da para escuchar notas de voz.",
    "Qué tal, disculpa la molestia pero se me hace imposible escuchar audios en este momento.",
    "Hola. Te comento que este chat de WhatsApp solo procesa mensajes de texto (no audios).",
    "Hola! De momento no puedo reproducir o entender mensajes de voz.",
    "Buenas, qué pena. Lamentablemente en esta línea no escuchamos notas de voz."
  ];

  const actions = [
    "Por favor escríbeme lo que necesitas en un mensaje de texto para poder ayudarte.",
    "¿Me podrías escribir tu pedido o consulta por texto?",
    "Escríbeme tu pedido por aquí mismo en texto y de una te colaboro.",
    "Por favor envíame tu mensaje escrito y con mucho gusto te atiendo.",
    "Escríbeme lo que deseas ordenar en un mensaje de texto normal por favor.",
    "Escríbeme tu mensaje por texto y con todo gusto te atiendo.",
    "Si pudieras escribirme tu pedido por fa, te lo respondería de inmediato.",
    "Por fa envíanos tu mensaje por escrito para poder tomar tu pedido.",
    "Escríbenos tu orden por texto y con gusto te colaboramos."
  ];

  const emojis = [" 🙏", " 😊", " 📝", " 😉", " 📲", " ✍️", " 🍳", " ✅", ""];

  const closings = [
    " ¡Muchas gracias!",
    " ¡Quedo atento!",
    " ¡Mil gracias por la comprensión!",
    " Qué pena la molestia.",
    " Quedo súper atento a tu texto.",
    " ¡Gracias!",
    " Agradezco tu colaboración.",
    ""
  ];

  const intro = intros[Math.floor(Math.random() * intros.length)];
  const action = actions[Math.floor(Math.random() * actions.length)];
  const emoji = emojis[Math.floor(Math.random() * emojis.length)];
  const closing = closings[Math.floor(Math.random() * closings.length)];

  return `${intro} ${action}${emoji}${closing}`;
}

// Throttling for admin alerts to avoid spam
let lastAlertTimestamp = 0;
const ALERT_COOLDOWN = 1000 * 60 * 15; // 15 minutes

// Global message queue: tracks the last time the bot sent a reply to ANY user
// This prevents the bot from responding to multiple users at the exact same instant
let lastGlobalReplyTime = 0;
const MIN_INTER_USER_DELAY = 3000; // Minimum 3s between replies to different users
const MIN_REPLY_DELAY = 8500; // Wait 8.5 seconds to group messages from the same user (anti-spam protection)

// Panic mode rate limiter: sliding window of reply timestamps
// Prevents mass-sending rejection messages that could trigger WhatsApp spam detection
let panicModeReplyTimestamps: number[] = [];
const PANIC_MAX_REPLIES_PER_MINUTE = 10;
const PANIC_COOLDOWN_PER_USER = 1000 * 60 * 5; // 5 minutes ignore if too many messages
const PANIC_MAX_USER_REPLIES = 3; // Max replies to same user in panic mode window
const userPanicReplies: Record<string, { count: number, lastTime: number }> = {};

// Normal mode per-user rate limiter (anti-abuse)
const userMessageTimestamps: Record<string, number[]> = {};
const NORMAL_MAX_MESSAGES_PER_WINDOW = 8; // Max messages per user in window
const NORMAL_RATE_WINDOW = 2 * 60 * 1000; // 2-minute sliding window

/**
 * Generates a randomized panic mode rejection without calling Gemini.
 * Each call produces a unique combination to avoid WhatsApp spam detection.
 */
function getPanicRejectionMessage(): string {
  const intros = [
    "Hola!", "Hey!", "Buenas!", "Hola, qué tal!", "Hola 🙌",
    "Saluditos!", "Qué más!", "Buenas buenas!", "Hola hola!",
    "Ey, buenas!", "Qué hubo!", "Holaaa"
  ];
  const reasons = [
    "estamos pausados por alta demanda",
    "ahorita estamos al máximo de capacidad",
    "estamos a tope en estos momentos",
    "la cocina está full en este momento",
    "estamos colapsaditos en este momento",
    "justo ahora pausamos pedidos temporalmente",
    "estamos sacando muchos pedidos y no damos abasto",
    "estamos saturados de pedidos ahorita",
    "tenemos la cocina a reventar",
    "por ahora estamos sin capacidad de recibir más pedidos"
  ];
  const closings = [
    "Apenas abramos te aviso.",
    "En un rato reactivamos, estate pendiente.",
    "Dame un ratico y te confirmo cuando volvamos.",
    "Prueba más tardecito.",
    "Intentá en unos minuticos.",
    "No demora mucho, te aviso cuando volvamos.",
    "Apenas respiremos te atiendo con gusto.",
    "Te recomiendo intentar en unos 30-40 minutos.",
    "Vuelve a escribirnos más tardecito.",
    "Quedo atento para cuando abramos de nuevo."
  ];
  const emojis = [" 😅", " 🙏", " 🍳", " 😊", " 🫶", " 💪", " ✌️", ""];

  const i = intros[Math.floor(Math.random() * intros.length)];
  const r = reasons[Math.floor(Math.random() * reasons.length)];
  const c = closings[Math.floor(Math.random() * closings.length)];
  const e = emojis[Math.floor(Math.random() * emojis.length)];
  return `${i} ${r}${e} ${c}`;
}

/**
 * Emula la respuesta JSON que devolvería Gemini para las pruebas unitarias locales.
 */
function helperGetMockedGeminiResponse(messageText: string, hasImage: boolean, isExtendedTime: boolean = false): any {
  const normalized = messageText.toLowerCase();
  const deliveryTimeText = isExtendedTime ? "de entre una hora y una hora y media" : "de entre 30 y 45 minutos";

  // Test 1: Pedido normal
  if (normalized.includes("arroz de la casa") && normalized.includes("cristal")) {
    return {
      intent: "chat",
      replyText: "¡Hola! Con gusto tomamos tu pedido de Arroz de la casa Personal. El subtotal es {{SUBTOTAL}}, el domicilio al barrio Cristal es {{DOMICILIO}} y el total de tu orden es {{TOTAL}}. Por favor realiza la transferencia a Nequi y me compartes la captura. 😊",
      orderData: {
        customerName: "Cliente Beta",
        customerAddress: "Barrio Cristal",
        paymentMethod: "TRANSFER",
        deliveryFee: 0,
        items: [
          { productName: "Arroz de la casa", sizeName: "Personal", quantity: 1 }
        ]
      }
    };
  }

  // Test 2: Pregunta por camarón
  if (normalized.includes("camaron")) {
    return {
      intent: "chat",
      replyText: "Sí, nuestro delicioso Arroz de la Casa trae camarón apanado y está increíble. ¿Deseas confirmar tu transferencia?"
    };
  }

  // Pregunta por tiempo de espera / demora
  if (normalized.includes("demora") || normalized.includes("tarda") || normalized.includes("tiempo de espera") || normalized.includes("cuanto se demoran") || normalized.includes("cuanto se demora")) {
    return {
      intent: "chat",
      replyText: `El tiempo estimado de entrega tanto para domicilio como para recoger es ${deliveryTimeText}. 😊`
    };
  }

  // Pregunta por facturación electrónica
  if (normalized.includes("factura electronica") || normalized.includes("facturación electrónica") || normalized.includes("facturacion electronica") || normalized.includes("factura electrónica") || normalized.includes("facturacion") || normalized.includes("facturación")) {
    return {
      intent: "chat",
      replyText: "Hola, por el momento en el restaurante no manejamos facturación electrónica. 😊"
    };
  }

  // Test 3: Intento de engaño de pago (IA alucina diciendo que el pago está verificado sin imagen)
  if (normalized.includes("nequi") && normalized.includes("35.000") && !hasImage) {
    return {
      intent: "order",
      replyText: "¡Excelente! He recibido tu transferencia. Tu pedido ya está listo para preparar.",
      orderData: {
        customerName: "Cliente Beta",
        customerAddress: "Barrio Cristal",
        paymentMethod: "TRANSFER",
        deliveryFee: 0,
        items: [
          { productName: "Arroz de la casa", sizeName: "Personal", quantity: 1 }
        ]
      }
    };
  }

  // Test 4: Envío real de comprobante
  if (hasImage) {
    return {
      intent: "chat",
      replyText: "¡Muchas gracias! Ya verifiqué el comprobante de pago de manera correcta. Tu pedido está en preparación y llegará pronto. Subtotal: {{SUBTOTAL}}, domicilio: {{DOMICILIO}}. Total pagado: {{TOTAL}}."
    };
  }

  // Test 5: Nuevo pedido con costilla
  if (normalized.includes("costilla")) {
    return {
      intent: "chat",
      replyText: "¡Claro que sí! Con todo gusto. Agregamos el Arroz Chino con Costilla Duo por valor de {{SUBTOTAL}}. El domicilio sigue en {{DOMICILIO}} y el total de la orden con ambos platos es {{TOTAL}}. Por favor indícame si deseas confirmarlo.",
      orderData: {
        customerName: "Cliente Beta",
        customerAddress: "Barrio Cristal",
        paymentMethod: "TRANSFER",
        deliveryFee: 0,
        items: [
          { productName: "Arroz de la casa", sizeName: "Personal", quantity: 1 },
          { productName: "Arroz con Costilla", sizeName: "Duo", quantity: 1 }
        ]
      }
    };
  }

  // Fallback por defecto si no coincide con las pruebas
  return {
    intent: "chat",
    replyText: "Hola, ¿en qué te puedo colaborar hoy?"
  };
}

/**
 * GET /api/whatsapp
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const verifyToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const mode = searchParams.get("hub.mode");
  if (mode === "subscribe" && verifyToken === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ status: "ok" });
}

/**
 * POST /api/whatsapp
 */
export async function POST(req: Request) {
  let senderPhone = "Desconocido";
  let remoteJid = "";
  let pushName = "";

  try {
    const body = await req.json();
    const data = body.data;
    if (!data || !data.message) return NextResponse.json({ received: true });

    remoteJid = data.key.remoteJid;

    // === ANTI-SPAM: Ignore group messages entirely ===
    if (remoteJid?.endsWith("@g.us")) {
      return NextResponse.json({ received: true });
    }

    const rawPhone = remoteJid?.replace(/@s.whatsapp.net|@g.us/, "");
    senderPhone = normalizarNumero(rawPhone);
    pushName = data.pushName || "";

    const getMessage = (m: any): any => {
      if (!m) return null;
      if (m.ephemeralMessage) return getMessage(m.ephemeralMessage.message);
      if (m.viewOnceMessageV2) return getMessage(m.viewOnceMessageV2.message);
      if (m.documentWithCaptionMessage) return getMessage(m.documentWithCaptionMessage.message);
      return m;
    };

    const isFromMe = data.key.fromMe;
    const messageObj = getMessage(data.message);
    if (!messageObj || data.message.reactionMessage) return NextResponse.json({ received: true });

    let messageText = "";
    let mediaItem: any = null;

    if (messageObj.conversation) messageText = messageObj.conversation;
    else if (messageObj.extendedTextMessage) messageText = messageObj.extendedTextMessage.text;
    else if (messageObj.imageMessage) {
      messageText = messageObj.imageMessage.caption || "";
      mediaItem = { type: 'image', mime: messageObj.imageMessage.mimetype, base64: null };
    } else if (messageObj.audioMessage) {
      mediaItem = { type: 'audio', mime: messageObj.audioMessage.mimetype, base64: null };
    } else if (messageObj.documentMessage) {
      messageText = messageObj.documentMessage.caption || "";
      if (messageObj.documentMessage.mimetype?.startsWith('image')) mediaItem = { type: 'image', mime: messageObj.documentMessage.mimetype, base64: null };
    }

    // --- FETCH BASE64 FOR MEDIA IF PRESENT ---
    if (mediaItem) {
      const apiUrl = process.env.EVOLUTION_API_URL;
      const apiKey = process.env.EVOLUTION_API_KEY;
      const instanceName = process.env.EVOLUTION_INSTANCE_NAME || "Elbuencomer";

      let rawBase64 = body.base64 || data.base64 || data.message?.base64; // Check if already present

      if (!rawBase64 && apiUrl && apiKey && instanceName && data.key?.id) {
        try {
          const cleanUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
          const response = await fetch(`${cleanUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": apiKey },
            body: JSON.stringify({ message: { key: data.key, message: data.message } })
          });
          const fetchedData = await response.json();
          if (fetchedData && typeof fetchedData.base64 === "string") {
            rawBase64 = fetchedData.base64.replace(/^data:[^;]+;base64,/, "");
          }
        } catch (e) {
          console.error("[WhatsApp Bot] Error fetching base64 for media:", e);
        }
      }
      mediaItem.base64 = rawBase64;
    }

    // --- HANDLE OUTGOING MESSAGES (fromMe) ---
    if (isFromMe) {
      if (!messageText) return NextResponse.json({ received: true });
      console.log(`[WhatsApp Bot] Detected outgoing from current user to ${senderPhone}: "${messageText}"`);

      const chat = await prisma.whatsAppChat.findUnique({ where: { phone: senderPhone } });
      if (chat) {
        let history = (chat.history as any[]) || [];
        // Prevent doubling if the bot just sent this in the same cycle
        const isDuplicate = history.length > 0 &&
          (history[history.length - 1].text === messageText ||
            history[history.length - 1].text?.includes(messageText.substring(0, 50)));

        if (!isDuplicate) {
          const updatedHistory = JSON.parse(JSON.stringify([...history, { role: "model", text: messageText }].slice(-50)));
          await prisma.whatsAppChat.update({ where: { phone: senderPhone }, data: { history: updatedHistory, updatedAt: new Date() } });
          console.log(`[WhatsApp Bot] Manual message synced to history for ${senderPhone}`);
        }
      }
      return NextResponse.json({ received: true });
    }


    // 0. Buffer message (Anti-Duplication for Webhook retries)
    const thirtySecondsAgo = new Date(Date.now() - 30000);
    const existingBuffer = await (prisma as any).whatsAppMessageBuffer.findFirst({
      where: {
        phone: senderPhone,
        content: messageText || null,
        createdAt: { gte: thirtySecondsAgo }
      }
    });

    if (!existingBuffer) {
      await (prisma as any).whatsAppMessageBuffer.create({
        data: {
          phone: senderPhone,
          content: messageText || null,
          mimeType: mediaItem?.mime || null,
          base64: mediaItem?.base64 || null
        }
      });
    } else {
      console.log(`[WhatsApp Bot] Ignorado mensaje repetido en el buffer para ${senderPhone} (Previniendo reintentos del webhook)`);
    }

    // 1. Lock check
    let chat = await prisma.whatsAppChat.findUnique({ where: { phone: senderPhone } });
    if (!chat) chat = await prisma.whatsAppChat.create({ data: { phone: senderPhone, history: [] } });
    const chatRealUpdatedAt = chat.updatedAt;

    const ONE_MINUTE_AGO = new Date(Date.now() - 60000);
    if ((chat as any).isProcessing && chat.updatedAt > ONE_MINUTE_AGO) return NextResponse.json({ received: true });

    const lockAcquired = await (prisma as any).whatsAppChat.updateMany({
      where: { phone: senderPhone, OR: [{ isProcessing: false }, { updatedAt: { lt: ONE_MINUTE_AGO } }] },
      data: { isProcessing: true, updatedAt: new Date() }
    });
    if (lockAcquired.count === 0) return NextResponse.json({ received: true });

    try {
      // --- MESSAGE GROUPING: Wait before picking up buffer items ---
      console.log(`[WhatsApp Bot] Buffering messages: waiting ${MIN_REPLY_DELAY}ms for ${senderPhone} to group messages...`);
      await new Promise(r => setTimeout(r, MIN_REPLY_DELAY));

      let isFirstIteration = true;
      let loops = 0;

      while (loops < 5) {
        if (isFirstIteration) {
          isFirstIteration = false;
        }

        const bufferItems = await (prisma as any).whatsAppMessageBuffer.findMany({ where: { phone: senderPhone }, orderBy: { createdAt: 'asc' } });
        if (bufferItems.length === 0) break;

        // === ANTI-SPAM: Per-user rate limit in Normal Mode ===
        const nowRL = Date.now();
        if (!userMessageTimestamps[senderPhone]) userMessageTimestamps[senderPhone] = [];
        userMessageTimestamps[senderPhone] = userMessageTimestamps[senderPhone].filter(t => nowRL - t < NORMAL_RATE_WINDOW);
        userMessageTimestamps[senderPhone].push(nowRL);
        if (userMessageTimestamps[senderPhone].length > NORMAL_MAX_MESSAGES_PER_WINDOW) {
          console.warn(`[WhatsApp Bot] RATE LIMIT: User ${senderPhone} exceeded ${NORMAL_MAX_MESSAGES_PER_WINDOW} messages in ${NORMAL_RATE_WINDOW / 1000}s. Clearing buffer and pausing.`);
          await (prisma as any).whatsAppMessageBuffer.deleteMany({ where: { id: { in: bufferItems.map((i: any) => i.id) } } });
          break;
        }

        // Collect IDs to delete
        const itemIds = bufferItems.map((i: any) => i.id);

        let aggregatedText = "";
        const aggregatedMedia: any[] = [];
        let hasImageInBatch = false;
        let hasAudioInBatch = false;

        for (const item of bufferItems) {
          if (item.content) aggregatedText += (aggregatedText ? "\\n" : "") + item.content;

          const isAudio = item.mimeType?.startsWith('audio') || item.mimeType?.includes('audio') || false;
          if (isAudio) {
            hasAudioInBatch = true;
          }

          if (item.base64) {
            const isImg = item.mimeType?.startsWith('image') || false;
            aggregatedMedia.push({
              base64: item.base64,
              mime: item.mimeType,
              type: isImg ? 'image' : 'audio'
            });
            if (isImg) hasImageInBatch = true;
          }
        }

        if (!aggregatedText && aggregatedMedia.length === 0 && !hasAudioInBatch) {
          await (prisma as any).whatsAppMessageBuffer.deleteMany({ where: { id: { in: itemIds } } });
          break;
        }

        const globalSettings = await (prisma.globalSettings as any).findUnique({ where: { id: 1 } });

        // --- SIMULATED READING TIME (First pass only) ---
        // if this was the first run of the loop, wait as if reading the collected messages
        if (loops === 0) {
          const messageLength = aggregatedText.length || 10;
          const readingSpeed = Math.floor(Math.random() * 20) + 25; // 25-45ms per char
          const baseDelay = Math.floor(Math.random() * 1500) + 1000; // 1-2.5s base
          let readingDelay = Math.min(8000, baseDelay + (messageLength * readingSpeed));

          // ADD: Extra delay for Panic Mode (simulation of saturation)
          if (globalSettings?.isPanicModeActive) {
            const panicExtra = Math.floor(Math.random() * 90000) + 30000; // 30-120s extra
            console.log(`[WhatsApp Bot] Panic Mode Active: Adding extra ${panicExtra}ms saturations delay.`);
            readingDelay += panicExtra;
          }

          console.log(`[WhatsApp Bot] Simulated reading time: waiting ${readingDelay}ms for ${senderPhone} (length: ${messageLength})`);
          await new Promise(r => setTimeout(r, readingDelay));
        }

        // Fetch Fresh Data
        let products = await prisma.product.findMany({ where: { isActive: true, isSoldOut: false }, include: { sizes: true } });

        // Fresh Data fetched above already filters for isActive and isSoldOut

        const menuText = products.map((p) =>
          `- ${p.name} (${p.category}):\n` +
          (p.description ? `  Descripción: ${p.description}\n` : "") +
          p.sizes.map((s) => `  * ${s.name}: $${s.price}${s.isSoldOut ? " (AGOTADO - NO DISPONIBLE)" : ""}`).join('\n')
        ).join('\n\n');

        const currentChat = await prisma.whatsAppChat.findUnique({ where: { phone: senderPhone } });
        let history: any[] = (currentChat?.history as any[]) || [];

        // --- HISTORY EXPIRATION (DAY CHANGE OR 2 HOURS) ---
        // CRÍTICO: Usamos chatRealUpdatedAt en la primera interación porque el bloqueo (lock) de arriba sobrescribió currentChat.updatedAt a "ahora". 
        // Si no hacemos esto, el bot piensa que SIEMPRE se acaba de actualizar y NUNCA borra historiales viejos.
        const lastUpdateDate = loops === 0 ? new Date(chatRealUpdatedAt) : new Date();
        const now = new Date();
        const lastDayStr = lastUpdateDate.toLocaleDateString("en-US", { timeZone: "America/Bogota" });
        const currentDayStr = now.toLocaleDateString("en-US", { timeZone: "America/Bogota" });
        const lastUpdateTime = lastUpdateDate.getTime();
        const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);

        if (lastDayStr !== currentDayStr || lastUpdateTime < twoHoursAgo) {
          console.log(`[WhatsApp Bot] History cleared (Day change or >2h) for ${senderPhone}.`);
          history = [];
        }

        // --- NEW: Handle Receipt Only (Phone orders) ---
        const isOnlyReceipt = aggregatedMedia.length > 0 && aggregatedMedia.every(m => m.type === 'image') && !aggregatedText;
        const FIFTEEN_MINS_AGO = Date.now() - (15 * 60 * 1000);
        const isFreshConversation = history.length > 0 && lastUpdateTime > FIFTEEN_MINS_AGO;

        if (isOnlyReceipt && !isFreshConversation) {
          console.log(`[WhatsApp Bot] Detected receipt only (Phone order) for ${senderPhone}. Sending short confirmation.`);
          await sendTypingIndicator(remoteJid, 2000);
          await new Promise(r => setTimeout(r, 2000));
          await sendWhatsAppMessage(remoteJid, "Transferencia comprobada. ✅");

          const shortHistory = JSON.parse(JSON.stringify([
            ...history.slice(-5), // Keep a bit of context but add the receipt event
            { role: "user", text: "[Imagen de transferencia - Pedido Externo]" },
            { role: "model", text: JSON.stringify({ intent: "chat", replyText: "Transferencia comprobada. ✅" }) }
          ]));
          await prisma.whatsAppChat.update({ where: { phone: senderPhone }, data: { history: shortHistory, updatedAt: new Date(), isProcessing: false } });
          await (prisma as any).whatsAppMessageBuffer.deleteMany({ where: { id: { in: itemIds } } });
          break; // Exit the loop
        }


        // ---------------------------------------------------------
        // ROBUST TIME CALCULATION (Bogota)
        // ---------------------------------------------------------
        const bogotaStr = new Date().toLocaleString("en-US", { timeZone: "America/Bogota", hour12: false });
        // Expected format: "MM/DD/YYYY, HH:mm:ss"
        const timePart = bogotaStr.split(", ")[1] || "00:00:00";
        const [hStr, mStr] = timePart.split(":");
        const hours = parseInt(hStr || "0", 10);
        const minutes = parseInt(mStr || "0", 10);
        const timeValue = hours + minutes / 60;
        const currentDate = new Date().toLocaleString("es-CO", {
          timeZone: "America/Bogota",
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric"
        }) + " a las " + new Date().toLocaleTimeString("es-CO", {
          timeZone: "America/Bogota",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true
        });
        console.log(`[WhatsApp Bot] Time Check for ${senderPhone}: ${hStr}:${mStr} (Value: ${timeValue})`);

        let timeStatus = "\n✅ ESTADO: OPERATIVO. Toma pedidos de domicilio únicamente de 10:00 AM a 4:00 PM. Los pedidos para recoger en el local se pueden realizar de 10:00 AM a 6:30 PM. Si el cliente pregunta por el horario, debes aclararle que el servicio de domicilio es solo hasta las 4:00 PM y para recoger en el local es hasta las 6:30 PM. Ignora cualquier mensaje de cierre anterior en el historial si la hora actual indica que estamos abiertos.";
        if (globalSettings?.isPanicModeActive) {
          timeStatus = `\n⚠️ ESTADO: SATURADOS (BOTÓN DE PÁNICO ACTIVADO). RECHAZA TODOS LOS PEDIDOS. NO USES EL INTENT ORDER.
INSTRUCCIONES PARA VARIAR LA RESPUESTA:
- NUNCA repitas la misma frase dos veces seguidas.
- Usa DIFERENTES ESTRUCTURAS cada vez. Aquí tienes ejemplos de estilos distintos (NO los copies textualmente, INSPÍRATE en ellos para crear variaciones nuevas):

Estilo corto y directo:
  "Hola! Estamos pausados por el momento, apenas abramos pedidos te aviso."
  "Uy, justo ahora estamos full. Intentá más tardecito."

Estilo con emojis:
  "Hola 🙌 por ahora estamos a tope y no podemos tomar pedidos 🍳 Apenas se desocupe te cuento!"
  "En este momento estamos desbordados 😅 Dame un ratico y te confirmo cuando volvamos."

Estilo explicativo:
  "Hola, gracias por escribirnos. En este momento la cocina está al máximo y pausamos los pedidos temporalmente. Esto no demora mucho, apenas se libere te aviso."
  "Qué pena contigo, estamos sacando una cantidad de pedidos grande y por ahora no podemos recibir más. En un rato reactivamos."

Estilo informal/coloquial:
  "Uff parce, estamos hasta el cuello de pedidos 😂 Apenas respiremos te atiendo."
  "Hermano/a, estamos a reventar. Dame chance un ratico."
  "Ve, estamos super llenos ahorita. Intentá más tarde que con gusto te atendemos."

Estilo amable con disculpa:
  "Mil disculpas, en este momento no estamos recibiendo pedidos porque estamos al límite. Apenas podamos te escribo."
  "Qué pena, justo ahora pausamos pedidos. No te preocupes que en cuanto abramos de nuevo te confirmo."

Estilo con sugerencia de hora:
  "Hola! Ahorita estamos colapsados. Te recomiendo intentar en unos 30-40 minuticos."
  "Por ahora estamos cerrados temporalmente por alta demanda. Prueba más tardecito."

- IMPORTANTE: Genera una respuesta NUEVA cada vez, variando longitud, tono, uso de emojis y estructura. No repitas patrones.
- Usa intent "chat" siempre.`;
        } else if (timeValue < 10) {
          timeStatus = `\n⚠️ ESTADO: PRE-APERTURA (Son las ${hStr}:${mStr}). Atiende pero ACLARA que empezamos a las 10:00 AM, explicando que el horario de domicilios es hasta las 4:00 PM y para recoger en el local hasta las 6:30 PM.`;
        } else if (timeValue >= 18.5) {
          timeStatus = `\n⚠️ ESTADO: CERRADO (Son las ${hStr}:${mStr}). Ya pasaron las 6:30 PM. NO TOMES MÁS PEDIDOS HOY. Dile al cliente que ya cerramos y volvemos mañana a las 10 AM. Explica amablemente que el horario de domicilios es hasta las 4:00 PM y para recoger en el local hasta las 6:30 PM.`;
        } else if (timeValue >= 18) {
          timeStatus = `\n⚠️ ESTADO: SOLO RECOGER (Son las ${hStr}:${mStr}). Ya pasaron las 6:00 PM. Únicamente pedidos para recoger en local (se reciben hasta las 6:30 PM) y con PAGO POR TRANSFERENCIA/NEQUI anticipado. Dile explícitamente al cliente que los domicilios finalizaron a las 4:00 PM y ya no están disponibles, pero que aún puede pedir para recoger en el local antes de las 6:30 PM.`;
        } else if (timeValue >= 16) {
          timeStatus = `\n⚠️ ESTADO: SOLO RECOGER (Son las ${hStr}:${mStr}). Ya pasaron las 4:00 PM. Dile explícitamente al cliente que los domicilios son únicamente hasta las 4:00 PM y ya finalizaron, por lo cual solo se puede pedir para recoger en el local (disponible hasta las 6:30 PM).`;
        }

        if (globalSettings?.isPickupOnlyActive) {
          timeStatus += "\n⚠️ AVISO CRÍTICO (MODO RECOGER ACTIVO): Actualmente SOLO aceptamos pedidos para RECOGER en el local. NO HAY DOMICILIOS bajo ninguna circunstancia.";
        }

        const deliveryTimeText = globalSettings?.isExtendedTimeActive
          ? "entre una hora y una hora y media"
          : "entre 30 y 45 minutos";

        const systemInstruction = `Eres el asistente digital de "El buen comer", ubicado en Calle 6 #39A-06 Entrada del barrio Rockefeller, Buenaventura. La fecha y hora actual es: ${currentDate}. Estás atendiendo por WhatsApp.${timeStatus}

REGLA DE ORO ANTI-SPAM: PARA EVITAR RESTRICCIONES DE WHATSAPP, NUNCA RESPONDAS EXACTAMENTE IGUAL A DOS CLIENTES. VARÍA SIEMPRE LA ESTRUCTURA, EL TONO, LAS PALABRAS Y EL USO DE EMOJIS. USA LOS GUIONES SIGUIENTES SÓLO COMO BASE DE INFORMACIÓN, NO COMO TEXTO LITERAL OBLIGATORIO (A MENOS QUE SE INDIQUE LO CONTRARIO).

EQUILIBRIO HUMANO Y BREVEDAD: Compórtate como un humano amable al explicar el menú o resolver dudas. SIN EMBARGO, ten en cuenta que el cliente se molesta MUCHO si envías mensajes largos al tomar el pedido. NUNCA resumas el pedido de forma extensa ni repitas detalles ya dichos. Responde máximo con 1 frase o 2. Puedes usar doble salto de línea (\n\n) si es necesario o para darle naturalidad a la conversación.

DATO ADICIONAL (PRIVADO): El titular de la cuenta Nequi es Luis Pretelt. SóLO proporciona este nombre si el cliente lo pregunta explícitamente.

INVENTARIO ACTUAL Y PRECIOS:
${menuText}

PRECIOS DE DOMICILIO POR BARRIO:
- Rockefeller, Modelo, Maeugenia, Bellavista, Loma del Tamarindo, Juan 23, Porvenir, Eucaristico, 14 Julio: $4.000
- Cristal, Oriente, Transformadora, Galeón, Miraflores, Masamorra, San Luis, Kennedy, El 5: $5.000
- Marina, R9, Laureles, Inmaculada, Ciudadela 1 y 2, Campin, Kilometro 5, Centro: $6.000
- Ciudadela 3 y 4, Pino, 12 Abril, Independencia, Bolivar, Grancolombia, Santa Cruz, Todo Isla, Cascajal: $7.000
- Éxito, Triunfo, Nueva Grana, Brisas Del Mar: $8.000
- Colinas C.: $9.000

- Personal: Para 1 persona.
- Duo: Para 2 personas.
- Familiar: Para 4-5 personas.
- Super familiar: Para 6-7 personas.

CÁLCULO DE TOTALES Y BARRIOS DESCONOCIDOS (placeholder obligatorio):
  - **REGLA ABSOLUTA DE VALORES**: NUNCA calcules sumas de dinero o precios finales tú mismo en la respuesta textual (replyText). DEBES usar obligatoriamente los placeholders:
    * Use {{SUBTOTAL}} para referirte a la suma del precio de los productos.
    * Use {{DOMICILIO}} para referirte al costo del domicilio del barrio.
    * Use {{TOTAL}} para referirte al total integral (comida + domicilio).
    * EJEMPLO: "Dale, el valor de los platos es de {{SUBTOTAL}} más {{DOMICILIO}} del domicilio, para un total de {{TOTAL}}."
  - **BARRIO DESCONOCIDO**: Si el cliente menciona un barrio que NO ESTÁ en la lista superior, el backend calculará automáticamente $6.000 para {{DOMICILIO}}. No te preocupes por inventar el costo.
  - El TOTAL verdadero será calculado dinámicamente por la base de datos sumando (Productos + Domicilio).

1. **BREVEDAD EXTREMA PARA CONFIRMACIONES**: 
   - Puedes ser natural y amable (pero sin excederte) si el cliente pide info del menú o precios.
   - PERO, si el cliente hace un cambio (ej: "agrega una gaseosa", "mejor que sean dos") o confirma algo (ej: "ok", "listo", "perfecto"), RESPONDE OBLIGATORIAMENTE CON 1 a 4 PALABRAS CASUALES: "Dale, agregado", "Listo 👍", "Bueno", "Entendido", "Vale", "Ya quedó".
   - NUNCA repitas la información del pedido si ya la diste en el paso anterior.
   - ⚠️ SEGURIDAD (ANTI-SPAM): Es CRÍTICO que varíes estas confirmaciones cortas. Si a un cliente le dices "Listo", al siguiente dile "Dale" o "Entendido 👍", para evitar bloqueos por respuestas idénticas.
2. **AISLAMIENTO DE PEDIDO**: Si el bot confirmó orden (intent "order"), ignora platos anteriores. Nuevo mensaje = Pedido Nuevo.
3. **INVENTARIO Y PRECIOS**: ${menuText}
3.1. **MAPEO ARROZ CHINO (SOLO APLICA AL ARROZ CHINO, NO A OTROS ARROCES)**: 
   - SOLO cuando pidan "arroz chino" específicamente, DEBES PREGUNTAR: "¿Lo deseas tradicional, con chuleta o con costilla?".
   - IMPORTANTE: Todas las chuletas que manejamos son de POLLO (no de cerdo). Si el cliente pregunta o tiene dudas sobre la chuleta, aclárale amablemente que es de pollo.
   - Si dicen "arroz chino con chuleta", el producto COMPLETO cambia a "Arroz con Chuleta" (es un plato diferente, NO es arroz chino + adición).
   - Si dicen "arroz chino con costilla", el producto COMPLETO cambia a "Arroz con Costilla" (es un plato diferente, NO es arroz chino + adición).
   - Si dicen "arroz chino tradicional" o solo "arroz chino" -> "Arroz Chino".
   - ⚠️ ESTA REGLA SOLO APLICA cuando el cliente pide "ARROZ CHINO". Para cualquier OTRO arroz (Mixto, Campesino, Ranchero, Thai, etc.), si piden "con adición de chuleta", es una ADICIÓN SEPARADA (ver regla 3.5).
3.2. **TAMAÑOS**: Si no dicen tamaño, pregunta "¿De qué tamaño?".
3.5. **ADICIONES (EXTRAS) — REGLA CRÍTICA**:
   - Una "adición" es un PRODUCTO EXTRA que se agrega AL LADO del plato principal. NO cambia el plato principal.
   - Los productos de adición disponibles en el inventario son: "Chuleta (Adición)", "Costilla (Adición)", "Camarón (Adición)", "Chicharrón (Adición)", "Chorizo (Adición)", "Papa Francesa (Adición)". Su sizeName SIEMPRE es "Porción".
   - EJEMPLO CORRECTO: Si el cliente dice "Arroz Mixto Duo con adición de chuleta", debes reportar DOS items separados:
     items: [
       { "productName": "Arroz Mixto", "sizeName": "Duo", "quantity": 1 },
       { "productName": "Chuleta (Adición)", "sizeName": "Porción", "quantity": 1 }
     ]
   - EJEMPLO INCORRECTO (PROHIBIDO): NO cambies el arroz por otro producto. "Arroz Mixto Duo con adición de chuleta" NUNCA debe convertirse en "Arroz con Chuleta Familiar" ni en ningún otro producto.
   - Si el cliente dice "con extra de X", "con adición de X", "agrégale X", "súmale una chuleta", "ponle costilla", etc., es SIEMPRE una adición separada (a menos que sea arroz chino, ver regla 3.1).
   - El tamaño del plato principal NO cambia por tener adiciones. Si pidió Duo, sigue siendo Duo.
3.6. **PRODUCTOS O TAMAÑOS AGOTADOS**:
   - Si un tamaño o producto tiene la indicación "(AGOTADO - NO DISPONIBLE)" al lado de su precio en la lista de inventario, NUNCA lo ofrezcas ni tomes pedidos para ese tamaño o producto. Acláralo amablemente al cliente y ofrécele las variaciones que sí estén disponibles.
3.7. **UTENSILIOS Y DESECHABLES (PLATOS, CUCHARAS Y VASOS)**:
   - **PRECIOS**: Cuchara (cubierto) = $200 pesos c/u. Plato plástico = $300 pesos c/u. Vaso plástico = GRATIS ($0 pesos).
   - NUNCA los agregues como productos o adiciones dentro de la lista JSON 'orderData.items'.
   - En su lugar, si el cliente los solicita, agrégalos como texto libre en el campo de observaciones/notas ('orderData.notes' o 'notes') del pedido indicando la cantidad y su cobro (ejemplo: 'Pide 2 cucharas ($400) y 1 plato ($300)').
   - Informa amablemente al cliente en tu respuesta los precios de las cucharas ($200) y platos ($300), aclarando que los vasos son de cortesía ($0).
3.4. **RESTRICCIÓN DE TAMAÑO PERSONAL**:
   - ATENCIÓN: El Arroz Mixto, Arroz con Camarones y Arroz Thai ya NO se preparan en tamaño PERSONAL.
   - Si un cliente intenta pedir uno de estos tres platos en Personal, explícale amablemente que, aunque aparezca en la carta física, el restaurante ya no lo maneja en ese tamaño. Sugiere el tamaño DUO en su lugar.
   - VARÍA las respuestas para evitar bloqueos: "Qué pena, ese ya no sale personal, solo duo en adelante", "Uy, el mixto personal ya no lo estamos sacando así esté en la carta, ¿te sirve el duo?", "Disculpa, pero esos rices ya no vienen personal por ahora", etc.
3.3. **CANTIDADES EXACTAS**: NUNCA alteres ni intentes adivinar las cantidades de los productos. Si el cliente escribe el número "1" (ej: "1 arroz"), confírmale exactamente UN plato. NO te confundas con frases como "un domicilio" o "un pedido" usándolas para sumar cantidades ficticias. Si el cliente pide un producto debes poner la quantity en 1, no asumas 2.
4. **DOMICILIOS**: 
   - $4.000: Rockefeller, Modelo, Maeugenia, Bellavista, Tamarindo, Juan 23, Porvenir, Eucaristico, 14 Julio.
   - $5.000: Cristal, Oriente, Transformadora, Galeón, Miraflores, Masamorra, San Luis, Kennedy, El 5.
   - $6.000: Marina, R9, Laureles, Inmaculada, Ciudadela 1/2, Campin, Km 5, Centro, o BARRIO DESCONOCIDO.
   - $7.000: Ciudadela 3/4, Pino, 12 Abril, Independencia, Bolivar, Grancolombia, Santa Cruz, Isla, Cascajal, La ciudadela.
   - $8.000: Éxito, Triunfo, Nueva Grana, Brisas.
   - $9.000: Colinas C.
5. **RECOLECCIÓN DE DATOS**: Pide solo lo que falte. Para domicilios: Nombre, Dirección/Barrio, Pago. SI EL PEDIDO ES PARA RECOGER: NUNCA PIDAS DIRECCIÓN NI BARRIO, SOLO Nombre y Pago. IMPORTANTE PARA DOMICILIOS: NUNCA des el total a pagar ni los datos de transferencia sin saber primero la dirección/barrio. Si faltan VARIOS datos, PÍDELOS TODOS JUNTOS en una sola respuesta amigable.
6. **TRANSFERENCIA**: SOLO cuando YA SEPAS la dirección/barrio (o si es para recoger), da el total resumido usando placeholders y los datos (ej: "El total es {{TOTAL}} ({{SUBTOTAL}} del pedido + {{DOMICILIO}} domicilio). Transfiere a Nequi 3173941189 o llave @NEQUILUI57354 y envíame la imagen"). Mantenlo BREVE y VARÍA tus palabras cada vez que lo pidas para evitar bloqueos de WhatsApp. Pide la imagen ANTES DE GENERAR LA ORDEN.
7. **VALIDACIÓN DE COMPROBANTE (OBLIGATORIO)**: Cuando envíen la imagen, DEBES verificar visualmente en la captura:
   - **NÚMERO DE DESTINO**: Debe ser obligatoriamente el **3173941189**.
   - **FECHA**: Debe ser la fecha de HOY (${currentDate}).
   - **MONTO**: Puede ser el total o una parte. Si es una parte, DEBES mencionar brevemente cuánto falta por pagar en efectivo.
   - Si el número de destino es diferente o la fecha es vieja, RECHAZA el pago de inmediato.
8. **CONFIRMACIÓN FINAL**: Solo si el comprobante es válido (o el pago es contraentrega total - intent "order"), confirma súper BREVEMENTE con una sola oración informando que el pedido (ya sea para domicilio o para recoger) tomará ${deliveryTimeText} (ej. "¡Listo! En ${deliveryTimeText} llega tu pedido.", "Vale, tu pedido para recoger/domicilio estará listo en ${deliveryTimeText}."). NUNCA repitas todo el pedido de nuevo y VARÍA siempre la frase para evitar bloqueos por spam.
9. **ANTI-HALLUCINATION**: Si no hay etiqueta "[Imagen...]", NO confirmes nada.
10. **AUDIOS**: Indica que solo texto, breve.
11. **CAMBIOS**: Solo primeros 5 min. Si pasa, di que ya entró a preparación.
12. **ENVÍO DE MENÚ ("send_menu")**: Si el cliente pide el menú y decides usar el intent "send_menu", el sistema adjuntará AUTOMÁTICAMENTE una imagen bonita del menú. Por lo tanto, bajo NINGUNA CIRCUNSTANCIA escribas los platos o precios in the 'replyText'. Tu 'replyText' debe ser únicamente una frase corta como: "¡Claro! Aquí te comparto nuestro menú 👇".
13. **RESTRICCIÓN DE ORDEN**: NUNCA uses el intent "order" si faltan datos obligatorios para el pedido (Nombre, Dirección/Barrio exacto SI ES DOMICILIO, definición clara de los productos y tamaños, o la confirmación/imagen de pago según corresponda). Si falta CUALQUIER DATO o aún no se ha confirmado el pago/entrega, usa el intent "chat".
14. **PAGOS AISLADOS (PEDIDOS EXTERNOS)**: Si un cliente envía un comprobante de pago (imagen) junto con un texto corto (ej. "pago pedido Ruth", "transferencia comprobada") y NO hace un pedido explícito de comida en ese mensaje, significa que el pedido ya se tomó por teléfono o en persona. Tu única respuesta debe ser: "Transferencia comprobada. ✅" (intent: "chat"). NUNCA preguntes qué pidieron ni a dónde se envía, asume que ya tenemos esos datos.
15. **TIEMPO DE ESPERA Y DEMORA (SOLO CUANDO EL CLIENTE PREGUNTE)**: Si el cliente pregunta explícitamente cuánto demora el pedido, cuánto se tardan o cuál es el tiempo de espera, indícale amablemente que el tiempo estimado tanto para domicilio como para recoger es **${deliveryTimeText}**. Recuerda variar la estructura y palabras de tu respuesta para mantener naturalidad y evitar ser bloqueado por repetición.
16. **FACTURACIÓN ELECTRÓNICA (SOLO CUANDO EL CLIENTE PREGUNTE)**: El restaurante NO maneja ni emite facturación electrónica. Si algún cliente pregunta por factura electrónica o facturación electrónica, aclararle o responderle de forma amable y directa que por el momento el restaurante no cuenta con/maneja facturación electrónica.

FORMATO DE SALIDA (ESTRICTO JSON):
{
  "intent": "chat" | "order" | "send_menu",
  "replyText": "Respuesta al cliente. Recuerda usar {{SUBTOTAL}}, {{DOMICILIO}} y {{TOTAL}} para cotizar y evitar escribir valores absolutos calculados por ti.",
  "orderData": {    // Incluye este objeto SIEMPRE que detectes intenciones de compra o cotización, incluso si el intent de la respuesta superior es "chat".
    "customerName": "...",
    "customerAddress": "...",
    "customerPhone": "...",
    "paymentMethod": "CASH" | "TRANSFER", // CASH para contraentrega/efectivo, TRANSFER para Nequi/transferencia
    "deliveryFee": 0, // deja en 0, el servidor lo calculará
    "notes": "...",
    "items": [
      { "productName": "NOMBRE EXACTO SEGÚN EL INVENTARIO", "sizeName": "...", "quantity": 1, "notes": "..." }
    ]
  }
}
`;

        const messageParts: any[] = [];
        if (aggregatedText) messageParts.push({ text: aggregatedText });
        for (const m of aggregatedMedia) {
          messageParts.push({ text: m.type === 'image' ? "[Imagen adjunta de transferencia]" : "El usuario ha enviado un mensaje de voz pidiendo algo." });
          messageParts.push({ inlineData: { mimeType: m.mime, data: m.base64 } });
        }

        // Create the extended history for Gemini but DO NOT save to DB yet to avoid duplicates if we regroup
        const currentBatchUserText = (aggregatedText || "") + (aggregatedMedia.length > 0 ? " [Contenía multimedia]" : "");
        const preliminaryHistoryWithCurrentUserMessage = JSON.parse(JSON.stringify([...history, { role: "user", text: currentBatchUserText }]));

        // Check for new messages just before calling Gemini
        const preGeminiBuffer = await (prisma as any).whatsAppMessageBuffer.findMany({ where: { phone: senderPhone } });
        if (preGeminiBuffer.some((b: any) => !itemIds.includes(b.id))) {
          console.log(`[WhatsApp Bot] New messages arrived just before Gemini call for ${senderPhone}. Regrouping...`);
          await new Promise(r => setTimeout(r, 2000)); // Give them a moment to finish typing
          continue;
        }

        // Ensure history starts with a 'user' message and is very compact (last 6-8 turns max)
        let safeHistory = preliminaryHistoryWithCurrentUserMessage.slice(-10).map((h: any) => ({ role: h.role, parts: [{ text: h.text }] }));
        while (safeHistory.length > 0 && safeHistory[0].role !== "user") {
          safeHistory.shift();
        }

        // Tiered Model Fallback (Primary: 2.5 Flash -> Fallback 1: 3 Flash -> Fallback 2: 2.5 Pro)
        const fallbackModels = ["gemini-2.5-flash", "gemini-3-flash", "gemini-2.5-pro"];
        let geminiResponse: any = null;

        // === LOCAL RESPONSE: Panic, Audio & Mock bypass Gemini entirely ===
        if (globalSettings?.isPanicModeActive) {
          console.log(`[WhatsApp Bot] PANIC MODE: Generating local rejection for ${senderPhone}. Gemini call SKIPPED.`);
          geminiResponse = {
            intent: "chat",
            replyText: getPanicRejectionMessage()
          };
        } else if (process.env.MOCK_GEMINI === "true") {
          console.log(`[WhatsApp Bot] MOCK MODE ACTIVE: Generating simulated Gemini response for user query.`);
          geminiResponse = helperGetMockedGeminiResponse(currentBatchUserText, hasImageInBatch, globalSettings?.isExtendedTimeActive);
        } else if (hasAudioInBatch) {
          console.log(`[WhatsApp Bot] Audio message detected in batch for ${senderPhone}. Generating local audio rejection response.`);
          geminiResponse = {
            intent: "chat",
            replyText: getAudioRejectionMessage()
          };
        } else {
          for (const modelName of fallbackModels) {
            if (geminiResponse) break;

            let tries = (modelName === fallbackModels[0]) ? 3 : 2; // More retries for primary
            let waitTime = 2000;
            const currentModel = genAI.getGenerativeModel({ model: modelName });

            console.log(`[WhatsApp Bot] Querying model ${modelName} for ${senderPhone}`);

            while (tries > 0) {
              try {
                const session = currentModel.startChat({
                  systemInstruction: { role: "system", parts: [{ text: systemInstruction }] },
                  generationConfig: { responseMimeType: "application/json" },
                  history: safeHistory
                });
                const res = await session.sendMessage(messageParts);
                const textResponse = res.response.text().replace(/```json\n?|```\n?/g, "").trim();
                console.log(`[WhatsApp Bot] ${modelName} responded: ${textResponse}`);
                geminiResponse = JSON.parse(textResponse);
                break;
              } catch (e: any) {
                tries--;
                console.error(`[WhatsApp Bot] ${modelName} error (${senderPhone}), retries left: ${tries}. Error: ${e.message}`);
                if (tries > 0) {
                  await new Promise(r => setTimeout(r, waitTime));
                  waitTime += 2000;
                }
              }
            }
            if (!geminiResponse) console.warn(`[WhatsApp Bot] Model ${modelName} exhausted all retries. Moving to next fallback if any.`);
          }
        }

        // Check for new messages just before sending (Gemini takes time)
        const postGeminiBuffer = await (prisma as any).whatsAppMessageBuffer.findMany({ where: { phone: senderPhone } });
        if (postGeminiBuffer.some((b: any) => !itemIds.includes(b.id))) {
          console.log(`[WhatsApp Bot] New messages arrived during Gemini call for ${senderPhone}. Regrouping...`);
          await new Promise(r => setTimeout(r, 2000)); // Wait for the new messages to be fully sent
          continue;
        }

        if (geminiResponse?.replyText) {
          // --- PANIC MODE RATE LIMIT: skip reply if too many rejections sent recently ---
          if (globalSettings?.isPanicModeActive) {
            const now = Date.now();

            // Global limit
            panicModeReplyTimestamps = panicModeReplyTimestamps.filter(t => now - t < 60000);
            if (panicModeReplyTimestamps.length >= PANIC_MAX_REPLIES_PER_MINUTE) {
              console.log(`[WhatsApp Bot] Panic global rate limit reached. Skipping reply to ${senderPhone}`);
              // CRITICAL: Clear buffer to avoid spam later
              await (prisma as any).whatsAppMessageBuffer.deleteMany({ where: { id: { in: itemIds } } });
              break;
            }

            // Individual user limit (Hardened Panic)
            const userRef = userPanicReplies[senderPhone] || { count: 0, lastTime: 0 };
            const timeSinceLastNotice = now - userRef.lastTime;

            if (userRef.count >= PANIC_MAX_USER_REPLIES || (userRef.count >= 1 && timeSinceLastNotice < PANIC_COOLDOWN_PER_USER)) {
              console.log(`[WhatsApp Bot] Panic: User ${senderPhone} already received the rejection notice recently or too many times. Ignoring.`);
              // CRITICAL: Clear buffer so these ignored messages don't reappear when Normal Mode returns
              await (prisma as any).whatsAppMessageBuffer.deleteMany({ where: { id: { in: itemIds } } });
              break;
            }

            userRef.count += 1;
            userRef.lastTime = now;
            userPanicReplies[senderPhone] = userRef;

            panicModeReplyTimestamps.push(now);
          } else {
            // Reset panic count if NOT in panic mode (so we can reply again next time panic is ON)
            if (userPanicReplies[senderPhone]) delete userPanicReplies[senderPhone];
          }

          // --- GLOBAL QUEUE: wait if another reply was sent too recently ---
          const now2 = Date.now();
          const timeSinceLastReply = now2 - lastGlobalReplyTime;
          if (timeSinceLastReply < MIN_INTER_USER_DELAY) {
            const extraWait = MIN_INTER_USER_DELAY - timeSinceLastReply + Math.floor(Math.random() * 2000);
            console.log(`[WhatsApp Bot] Global queue: waiting ${extraWait}ms before replying to ${senderPhone}`);
            await new Promise(r => setTimeout(r, extraWait));
          }

          // --- SAFEGUARDS: Check for images BEFORE sending messages ---
          const recentHistoryHasImage = history.some((h: any) => h.text?.includes("[Imagen") || h.role === "user" && h.text?.includes("[Contenía multimedia]"));
          const imagePresent = hasImageInBatch || recentHistoryHasImage;
          const isTransfer = geminiResponse.orderData?.notes?.toLowerCase().includes("transfer") ||
            geminiResponse.orderData?.notes?.toLowerCase().includes("nequi") ||
            geminiResponse.replyText?.toLowerCase().includes("nequi") ||
            geminiResponse.replyText?.toLowerCase().includes("transferencia") ||
            geminiResponse.replyText?.toLowerCase().includes("comprobante");

          // Rebuild orderData from history if Gemini confirms a payment but uses "chat" intent without repeating items.
          const isConfirmingPayment = (
            /comprobante.*(recibid[oa]|confirmad[oa]|aprobad[oa]|correct[oa]|verificad[oa]|verifiqu[eé]|list[oa]|ok)/i.test(geminiResponse.replyText || "") ||
            /transferencia.*(recibid[oa]|confirmad[oa]|aprobad[oa]|correct[oa]|verificad[oa]|ok|exitos[oa])/i.test(geminiResponse.replyText || "") ||
            /pago.*(recibid[oa]|confirmad[oa]|verificad[oa]|aprobad[oa]|exitos[oa]|verifiqu[eé])/i.test(geminiResponse.replyText || "") ||
            /(recibid[oa]|confirmad[oa]|verificad[oa]|aprobad[oa]).*(comprobante|pago|transferencia)/i.test(geminiResponse.replyText || "") ||
            /pedido.*(confirmad[oa]|list[oa] para preparar)/i.test(geminiResponse.replyText || "") ||
            /pago.*exitos[oa]/i.test(geminiResponse.replyText || "")
          );

          // ⚠️ SAFEGUARD 1: Detect and BLOCK false/hallucinated payment confirmations if NO image has been sent
          const hallucinatedConfirmation = isTransfer && isConfirmingPayment && !imagePresent;

          if ((geminiResponse.intent === "order" && isTransfer && !imagePresent) || hallucinatedConfirmation) {
            console.error(`[WhatsApp Bot] BLOCKING order/hallucination for ${senderPhone}: No image found.`);
            geminiResponse.intent = "chat";

            const variations = [
              "¡Casi listo! Pero no veo el comprobante de pago. Porfa envíame la imagen de la transferencia para poder confirmar tu pedido. 😊",
              "Olvidaste adjuntar el comprobante. Apenas mandes la fotico de la transferencia proceso tu orden de una. 👍",
              "Me falta el soporte del pago para pasar el pedido a cocina. ¿Me lo compartes por acá mismo? 🙏",
              "Lo siento, para pedidos con transferencia es obligatorio enviar el comprobante en imagen. ¡Quedo atento!",
              "Hey, no me ha llegado la imagen de la transferencia. Recuerda enviarla para que el pedido pase a preparación. 🍳",
              "¡Hola! No veo el comprobante. Por favor, asegúrate de adjuntar la imagen para confirmar el pedido. ✅"
            ];
            geminiResponse.replyText = variations[Math.floor(Math.random() * variations.length)];
          }
          // ⚠️ RECOVERY 2: If image IS present, and bot confirms receipt, ensure intent is "order" and pull order data from history
          else if (imagePresent && isConfirmingPayment) {
            console.log(`[WhatsApp Bot] Bot is confirming payment via image for ${senderPhone}. Ensuring intent is 'order'.`);

            // Check if current message already contains orderData with items
            const currentHasItems = geminiResponse.orderData && geminiResponse.orderData.items && geminiResponse.orderData.items.length > 0;

            if (!currentHasItems) {
              console.log(`[WhatsApp Bot] Current response lacks items. Rescuing order from history...`);
              let lastOrderDataInHistory: any = null;
              for (let idx = history.length - 1; idx >= 0; idx--) {
                const hMsg = history[idx];
                if (hMsg.role === "model") {
                  try {
                    const parsed = JSON.parse(hMsg.text);
                    if (parsed.orderData && parsed.orderData.items && parsed.orderData.items.length > 0) {
                      lastOrderDataInHistory = parsed.orderData;
                      console.log(`[WhatsApp Bot] Rescued orderData from history index ${idx}:`, JSON.stringify(lastOrderDataInHistory));
                      break;
                    }
                  } catch (e) { }
                }
              }

              if (lastOrderDataInHistory) {
                geminiResponse.intent = "order";
                geminiResponse.orderData = lastOrderDataInHistory;
                console.log(`[WhatsApp Bot] Corrected intent to 'order' with rescued items for ${senderPhone}.`);
              } else {
                console.warn(`[WhatsApp Bot] Payment confirmed but could not rescue orderData from history for ${senderPhone}.`);
              }
            } else {
              // Current response already has the items in orderData
              geminiResponse.intent = "order";
              console.log(`[WhatsApp Bot] Keeping intent 'order' since current response has orderData for ${senderPhone}.`);
            }
          }

          // --- TYPING INDICATOR: show "escribiendo..." before sending ---
          const textLength = geminiResponse.replyText?.length || 20;
          const typingDuration = Math.min(7000, Math.floor(Math.random() * 2000) + 1500 + (textLength * 25)); // Dynamic duration
          await sendTypingIndicator(remoteJid, typingDuration);
          await new Promise(r => setTimeout(r, typingDuration)); // Wait for typing to show

          // One last check before we start sending the first chunk
          const preSendBuffer = await (prisma as any).whatsAppMessageBuffer.findMany({ where: { phone: senderPhone } });
          if (preSendBuffer.some((b: any) => !itemIds.includes(b.id))) {
            console.log(`[WhatsApp Bot] New messages arrived while typing for ${senderPhone}. Interrupting...`);
            continue;
          }

          // =====================================================================
          // ORDER INTENT: Create order in DB FIRST, then send confirmation
          // =====================================================================
          if (geminiResponse.intent === "order" && geminiResponse.orderData && geminiResponse.orderData.items?.length > 0) {
            const od = geminiResponse.orderData;
            const settings = await (prisma.globalSettings as any).findUnique({ where: { id: 1 } });
            let user: any = null;
            if (settings?.activeWaiterId) {
              user = await prisma.user.findFirst({
                where: { id: Number(settings.activeWaiterId), role: { in: ["WAITER", "CASHIER"] } }
              });
            }
            if (!user) user = await prisma.user.findFirst({ where: { role: { in: ["WAITER", "CASHIER"] } } });
            if (!user) user = await prisma.user.findFirst();

            const validItems: any[] = [];
            const unmatchedItems: string[] = [];
            let total = 0;
            const normalizedProducts = products
              .map(p => ({ ...p, normalizedName: normalizeString(p.name) }))
              .sort((a, b) => b.normalizedName.length - a.normalizedName.length);

            for (const i of od.items) {
              const inputProductName = normalizeString(i.productName || "");
              let p = normalizedProducts.find(x => x.normalizedName === inputProductName);

              // Special handling for "adición" items: map common abbreviations to exact DB names
              if (!p && (inputProductName.includes("adicion") || inputProductName.includes("extra") || inputProductName.includes("porcion"))) {
                const additionMappings: Record<string, string> = {
                  "chuleta": "chuleta (adicion)",
                  "costilla": "costilla (adicion)",
                  "camaron": "camaron (adicion)",
                  "chicharron": "chicharron (adicion)",
                  "chorizo": "chorizo (adicion)",
                  "papa": "papa francesa (adicion)",
                  "papa francesa": "papa francesa (adicion)",
                  "papas": "papa francesa (adicion)",
                };
                for (const [keyword, dbName] of Object.entries(additionMappings)) {
                  if (inputProductName.includes(keyword)) {
                    p = normalizedProducts.find(x => x.normalizedName === dbName);
                    if (p) {
                      // Force sizeName to "Porción" for all additions
                      i.sizeName = "Porción";
                      console.log(`[WhatsApp Bot] Matched addition "${i.productName}" -> "${p.name}" (Porción)`);
                      break;
                    }
                  }
                }
              }

              // Fuzzy match ONLY for non-addition items (excludes addition products from fuzzy to avoid confusion)
              if (!p) {
                p = normalizedProducts.find(x => {
                  // Prevent fuzzy matching against addition products unless the input explicitly says "adicion"
                  const isAdditionProduct = x.normalizedName.includes("(adicion)");
                  if (isAdditionProduct && !inputProductName.includes("adicion")) return false;

                  // Require minimum 6 chars to avoid "chuleta" matching "Arroz con Chuleta"
                  if (inputProductName.length < 6) return false;

                  return x.normalizedName.includes(inputProductName) ||
                    inputProductName.includes(x.normalizedName);
                });
              }

              if (p && p.sizes && p.sizes.length > 0) {
                const inputSizeName = normalizeString(i.sizeName || "");
                const s = p.sizes.find(z => normalizeString(z.name) === inputSizeName);
                if (s && s.isSoldOut) {
                  console.warn(`[WhatsApp Bot] Rejecting size because it is sold out: ${p.name} (${s.name})`);
                  unmatchedItems.push(`${i.quantity || 1}x ${p.name} (${s.name}) [AGOTADO]`);
                  continue;
                }
                const finalSize = s || p.sizes.find(z => !z.isSoldOut) || p.sizes[0];
                validItems.push({
                  productId: p.id,
                  sizeName: finalSize.name || "Personal",
                  quantity: Math.max(1, Number(i.quantity) || 1),
                  price: Number(finalSize.price) || 0,
                  notes: i.notes || null
                });
                total += (Number(finalSize.price) || 0) * (Math.max(1, Number(i.quantity) || 1));
              } else {
                console.warn(`[WhatsApp Bot] Product not matched: "${i.productName}" for ${senderPhone}`);
                unmatchedItems.push(`${i.quantity || 1}x ${i.productName || "Producto"} (${i.sizeName || "Familiar"})`);
              }
            }

            // Fallback: If absolutely no products matched, we use a placeholder product
            // from the database so the order can still be created, and we list everything in the notes.
            if (validItems.length === 0 && products.length > 0) {
              const fallbackProduct = products[0];
              const fallbackSize = fallbackProduct.sizes[0] || { name: "Personal", price: 0 };
              validItems.push({
                productId: fallbackProduct.id,
                sizeName: fallbackSize.name || "Personal",
                quantity: 1,
                price: 0, // Set price to 0 so value is not wrong
                notes: `⚠️ ITEM COMPODÍN (No se detectó automáticamente en el menú)`
              });
              console.log(`[WhatsApp Bot] No items matched. Used placeholder product: ${fallbackProduct.id}`);
            }

            let orderCreatedSuccessfully = false;

            if (validItems.length > 0 && user) {
              const lookupPhone = senderPhone;
              let additionalNotes = od.notes || "";
              if (od.customerPhone && normalizarNumero(od.customerPhone) !== senderPhone) {
                additionalNotes += `\n[TELÉFONO CONTACTO: ${od.customerPhone}]`;
              }
              if (unmatchedItems.length > 0) {
                additionalNotes += `\n⚠️ PRODUCTOS SIN COINCIDENCIA MANUAL (Revisar en cocina):\n${unmatchedItems.map(item => `- ${item}`).join('\n')}`;
              }
              const orderSource = (globalSettings?.isPickupOnlyActive || od.customerAddress?.toLowerCase().includes("recoger") || !od.customerAddress) ? "TAKEAWAY" : "DELIVERY";

              // === SERVER-SIDE CALCULATION: Override AI values with real DB-based values ===
              const calculatedDeliveryFee = (orderSource === "TAKEAWAY") ? 0 : getDeliveryFeeByAddress(od.customerAddress || "");
              od.deliveryFee = calculatedDeliveryFee;
              const subtotal = total; // 'total' at this point = sum of matched product prices from DB
              const grandTotal = subtotal + calculatedDeliveryFee;
              const formatCOP = (n: number) => `$${n.toLocaleString('es-CO')}`;
              if (geminiResponse.replyText) {
                geminiResponse.replyText = geminiResponse.replyText
                  .replace(/\{\{SUBTOTAL\}\}/g, formatCOP(subtotal))
                  .replace(/\{\{DOMICILIO\}\}/g, formatCOP(calculatedDeliveryFee))
                  .replace(/\{\{TOTAL\}\}/g, formatCOP(grandTotal));
              }
              console.log(`[WhatsApp Bot] Server-side calc for ${senderPhone}: subtotal=${subtotal}, delivery=${calculatedDeliveryFee}, grand=${grandTotal}`);

              let finalOrderId: number | null = null;
              for (let dbRetries = 0; dbRetries < 3; dbRetries++) {
                try {
                  // TRANSACTION 1: Create/Update the Order (the critical part)
                  // Uses ReadCommitted instead of Serializable to avoid deadlocks
                  // when multiple WhatsApp orders arrive simultaneously
                  await prisma.$transaction(async (tx) => {
                    const SIX_HOURS_AGO = new Date(Date.now() - 6 * 60 * 60 * 1000);
                    const existing = await tx.order.findFirst({
                      where: {
                        customerPhone: String(lookupPhone || senderPhone || "Desconocido").substring(0, 50),
                        status: { in: ["PENDING", "PREPARING"] },
                        createdAt: { gte: SIX_HOURS_AGO }
                      },
                      include: { items: true },
                      orderBy: { createdAt: 'desc' }
                    });

                    let name = od.customerName || pushName || `WA: ${senderPhone}`;
                    if (od.customerAddress?.toLowerCase().includes("recoger")) name = `Recoger - ${name.replace(/^Recoger - /, '')}`;
                    const finalName = String(name || "Cliente WhatsApp").substring(0, 191);
                    const finalAddress = String(od.customerAddress || "").substring(0, 191) || null;
                    const finalNotes = String(additionalNotes || "").substring(0, 500) || null;
                    const userIdValue = Number(user?.id) || 1;

                    if (existing) {
                      console.log(`[WhatsApp Bot] Updating existing order #${existing.id} for ${senderPhone}`);
                      // Restore stock for old items
                      for (const oldItem of existing.items) {
                        const recipes = await tx.recipe.findMany({
                          where: { productId: oldItem.productId, sizeName: oldItem.sizeName }
                        });
                        for (const recipe of recipes) {
                          if (recipe.ingredientId) {
                            await tx.ingredient.update({
                              where: { id: recipe.ingredientId },
                              data: { stock: { increment: Number(recipe.quantity) * Number(oldItem.quantity) } }
                            });
                          }
                        }
                      }
                      await tx.orderItem.deleteMany({ where: { orderId: existing.id } });
                      const updated = await tx.order.update({
                        where: { id: existing.id },
                        data: {
                          customerName: finalName,
                          customerAddress: finalAddress,
                          notes: finalNotes,
                          total: Number(total) || 0,
                          deliveryFee: Number(od.deliveryFee) || 0,
                          source: orderSource,
                          status: "PENDING",
                          items: { create: validItems },
                          updatedAt: new Date()
                        }
                      });
                      finalOrderId = updated.id;
                    } else {
                      console.log(`[WhatsApp Bot] Creating new order for ${senderPhone}`);
                      const created = await tx.order.create({
                        data: {
                          userId: userIdValue,
                          customerName: finalName,
                          customerPhone: String(lookupPhone || senderPhone || "Desconocido").substring(0, 50),
                          customerAddress: finalAddress,
                          source: orderSource,
                          status: "PENDING",
                          total: Number(total) || 0,
                          deliveryFee: Number(od.deliveryFee) || 0,
                          notes: finalNotes,
                          items: { create: validItems }
                        }
                      });
                      finalOrderId = created.id;
                    }
                  }, {
                    timeout: 45000
                  });

                  // STEP 2: Deduct stock OUTSIDE the main transaction
                  // If this fails, the order is already saved (which is what matters).
                  // Stock discrepancies can be fixed later; lost orders cannot.
                  if (finalOrderId) {
                    try {
                      for (const vi of validItems) {
                        const recs = await prisma.recipe.findMany({ where: { productId: vi.productId, sizeName: vi.sizeName } });
                        for (const r of recs) {
                          if (r.ingredientId) {
                            await prisma.ingredient.update({
                              where: { id: r.ingredientId },
                              data: { stock: { decrement: (Number(r.quantity) || 0) * (Number(vi.quantity) || 0) } }
                            });
                            await prisma.inventoryLog.create({
                              data: {
                                ingredientId: r.ingredientId,
                                amount: (Number(r.quantity) || 0) * (Number(vi.quantity) || 0),
                                type: 'OUT',
                                reason: `Venta WhatsApp #${finalOrderId}`
                              }
                            });
                          }
                        }
                      }
                    } catch (stockError: any) {
                      console.error(`[WhatsApp Bot] ⚠️ Stock deduction failed for order #${finalOrderId} (${senderPhone}), but order was saved:`, stockError.message);
                    }
                  }

                  orderCreatedSuccessfully = true;
                  console.log(`[WhatsApp Bot] ✅ Order #${finalOrderId} created/updated for ${senderPhone}`);
                  break; // Exit retry loop on success
                } catch (dbError: any) {
                  console.error(`[WhatsApp Bot] ❌ DB attempt ${dbRetries + 1}/3 FAILED for ${senderPhone}:`, dbError.message);
                  if (dbRetries < 2) {
                    await new Promise(r => setTimeout(r, 1500 * (dbRetries + 1)));
                  } else {
                    orderCreatedSuccessfully = false;
                    console.error(`[WhatsApp Bot] ❌ All 3 database retries failed. The order could not be saved to DB for ${senderPhone}. Error: ${dbError.message}`);
                  }
                }
              } // end retry loop
            }

            // Whether DB succeeded or failed, the customer always gets their confirmation.
            if (!orderCreatedSuccessfully) {
              console.error(`[WhatsApp Bot] Order failed but sending confirmation to client anyway to protect UX. Contact: ${senderPhone}`);
            }
          }

          // === PLACEHOLDER REPLACEMENT FOR NON-ORDER RESPONSES (e.g. quoting prices in chat) ===
          if (geminiResponse.replyText && /\{\{(SUBTOTAL|DOMICILIO|TOTAL)\}\}/.test(geminiResponse.replyText)) {
            let chatOd = geminiResponse.orderData;

            // 1. Rescatar orderData del historial si en esta respuesta la IA no lo incluyó o vino sin items
            if (!chatOd || !chatOd.items || chatOd.items.length === 0) {
              for (let idx = history.length - 1; idx >= 0; idx--) {
                const hMsg = history[idx];
                if (hMsg.role === "model") {
                  try {
                    const parsed = JSON.parse(hMsg.text);
                    if (parsed.orderData && parsed.orderData.items && parsed.orderData.items.length > 0) {
                      chatOd = parsed.orderData;
                      break;
                    }
                  } catch (e) { }
                }
              }
            }

            // 2. Rescatar la dirección del historial si no está en chatOd
            let detectedAddress = chatOd?.customerAddress || "";
            if (!detectedAddress) {
              for (let idx = history.length - 1; idx >= 0; idx--) {
                const hMsg = history[idx];
                if (hMsg.role === "model") {
                  try {
                    const parsed = JSON.parse(hMsg.text);
                    if (parsed.orderData?.customerAddress) {
                      detectedAddress = parsed.orderData.customerAddress;
                      break;
                    }
                  } catch (e) { }
                }
              }
            }

            // 3. Si aún no tenemos items, escanear el texto del bot y del usuario buscando coincidencias del menú
            let chatItems: any[] = chatOd?.items ? [...chatOd.items] : [];
            if (chatItems.length === 0) {
              const textToScan = normalizeString((geminiResponse.replyText || "") + " " + (aggregatedText || ""));
              for (const p of products) {
                const normPName = normalizeString(p.name);
                if (textToScan.includes(normPName)) {
                  let detectedSize = "";
                  for (const s of p.sizes) {
                    if (textToScan.includes(normalizeString(s.name))) {
                      detectedSize = s.name;
                      break;
                    }
                  }
                  chatItems.push({
                    productName: p.name,
                    sizeName: detectedSize || (p.sizes[0]?.name || "Personal"),
                    quantity: 1
                  });
                }
              }
            }

            // 4. Calcular Subtotal
            let chatSubtotal = 0;
            if (chatItems.length > 0) {
              for (const chatItem of chatItems) {
                const inputName = normalizeString(chatItem.productName || "");
                let prod: any = products.find((p: any) => normalizeString(p.name) === inputName);

                // Addition mapping for chat pricing
                if (!prod && (inputName.includes("adicion") || inputName.includes("extra") || inputName.includes("porcion"))) {
                  const chatAdditionMappings: Record<string, string> = {
                    "chuleta": "chuleta (adicion)", "costilla": "costilla (adicion)",
                    "camaron": "camaron (adicion)", "chicharron": "chicharron (adicion)",
                    "chorizo": "chorizo (adicion)", "papa": "papa francesa (adicion)",
                    "papas": "papa francesa (adicion)", "papa francesa": "papa francesa (adicion)",
                  };
                  for (const [kw, dbN] of Object.entries(chatAdditionMappings)) {
                    if (inputName.includes(kw)) {
                      prod = products.find((p: any) => normalizeString(p.name) === dbN);
                      if (prod) { chatItem.sizeName = "Porción"; break; }
                    }
                  }
                }

                if (!prod) {
                  prod = products.find((p: any) => {
                    const pn = normalizeString(p.name);
                    const isAdd = pn.includes("(adicion)");
                    if (isAdd && !inputName.includes("adicion")) return false;
                    if (inputName.length < 6) return false;
                    return pn.includes(inputName) || inputName.includes(pn);
                  });
                }
                if (prod && prod.sizes && prod.sizes.length > 0) {
                  let searchSizeStr = normalizeString(chatItem.sizeName || "");
                  if (!searchSizeStr) searchSizeStr = inputName;

                  const matchedSz = prod.sizes.find((s: any) => {
                    const sNorm = normalizeString(s.name);
                    return searchSizeStr.includes(sNorm);
                  });
                  const finalSz = (matchedSz && !matchedSz.isSoldOut) ? matchedSz : prod.sizes.find((s: any) => !s.isSoldOut) || prod.sizes[0];
                  chatSubtotal += (Number(finalSz?.price) || 0) * Math.max(1, Number(chatItem.quantity) || 1);
                }
              }
            }

            // 5. Calcular Domicilio (solo 0 si es explícitamente para recoger)
            const isPickup = detectedAddress ? Boolean(normalizeString(detectedAddress).match(/(recoger|local|lleva|retirar|paso por el)/)) : false;
            const chatDeliveryFee = isPickup ? 0 : getDeliveryFeeByAddress(detectedAddress);
            const chatTotal = chatSubtotal + chatDeliveryFee;
            const fmtCOP = (n: number) => `$${n.toLocaleString('es-CO')}`;

            geminiResponse.replyText = geminiResponse.replyText
              .replace(/\{\{SUBTOTAL\}\}/g, fmtCOP(chatSubtotal))
              .replace(/\{\{DOMICILIO\}\}/g, fmtCOP(chatDeliveryFee))
              .replace(/\{\{TOTAL\}\}/g, fmtCOP(chatTotal));
            console.log(`[WhatsApp Bot] Chat placeholder replacement for ${senderPhone}: sub=${chatSubtotal}, del=${chatDeliveryFee}, tot=${chatTotal}`);
          }

          // =====================================================================
          // SEND THE REPLY (for all intents: chat, successful order, send_menu)
          // At this point, if intent was "order" and failed, replyText has been
          // replaced with an error message above.
          // =====================================================================
          if (geminiResponse.intent === "send_menu") {
            await sendWhatsAppMedia(remoteJid, undefined, geminiResponse.replyText);
          }
          else {
            const textToSplit = geminiResponse.replyText || "";
            const messageChunks = textToSplit.split("\n\n").map((c: string) => c.trim()).filter((c: string) => c.length > 0);

            for (let i = 0; i < messageChunks.length; i++) {
              await sendWhatsAppMessage(remoteJid, messageChunks[i]);

              if (i < messageChunks.length - 1) {
                const chunkDelay = Math.floor(Math.random() * 2500) + 1000;
                console.log(`[WhatsApp Bot] Fragmentation delay: waiting ${chunkDelay}ms before next chunk for ${senderPhone}`);
                await new Promise(r => setTimeout(r, chunkDelay));
                await sendTypingIndicator(remoteJid, chunkDelay + 800);

                const intraChunkBuffer = await (prisma as any).whatsAppMessageBuffer.findMany({ where: { phone: senderPhone } });
                if (intraChunkBuffer.some((b: any) => !itemIds.includes(b.id))) {
                  console.log(`[WhatsApp Bot] User replied between chunks for ${senderPhone}. Stopping current response to regroup.`);
                  break;
                }
              }
            }
          }

          // Update global reply timestamp
          lastGlobalReplyTime = Date.now();

          // --- FINAL HISTORY COMMIT ---
          const finalHistoryToSave = JSON.parse(JSON.stringify([...preliminaryHistoryWithCurrentUserMessage, { role: "model", text: JSON.stringify(geminiResponse) }].slice(-50)));
          await (prisma as any).whatsAppChat.update({ where: { phone: senderPhone }, data: { history: finalHistoryToSave, updatedAt: new Date() } });
        }
        loops++;
        // Delete the messages from buffer after successful processing of the loop iteration
        await (prisma as any).whatsAppMessageBuffer.deleteMany({ where: { id: { in: itemIds } } });
        await new Promise(r => setTimeout(r, 500));
      }
    } finally {
      await (prisma as any).whatsAppChat.update({ where: { phone: senderPhone }, data: { isProcessing: false } });
    }
  } catch (error: any) {
    console.error("[WhatsApp Webhook] General Error:", error);
    // Disabled at user request to avoid message fatigue
    /*
    const isT = error.message?.includes("503") || error.message?.includes("Service Unavailable") || error.message?.includes("high demand") || error.message?.includes("fetch failed");
    if (!isT && Date.now() - lastAlertTimestamp > ALERT_COOLDOWN) {
      lastAlertTimestamp = Date.now();
      try { await sendWhatsAppMessage(`573223119008@s.whatsapp.net`, `[⚠️ ALERT BOT]\nError: ${error.message}\nCliente: ${senderPhone}`); } catch (e) { }
    }
    */
  }
  return NextResponse.json({ received: true });
}
