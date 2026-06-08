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

// Throttling for admin alerts to avoid spam
let lastAlertTimestamp = 0;
const ALERT_COOLDOWN = 1000 * 60 * 15; // 15 minutes

// Global message queue: tracks the last time the bot sent a reply to ANY user
// This prevents the bot from responding to multiple users at the exact same instant
let lastGlobalReplyTime = 0;
const MIN_INTER_USER_DELAY = 3000; // Minimum 3s between replies to different users
const MIN_REPLY_DELAY = 15000; // Wait 15 seconds to group messages from the same user

// Panic mode rate limiter: sliding window of reply timestamps
// Prevents mass-sending rejection messages that could trigger WhatsApp spam detection
let panicModeReplyTimestamps: number[] = [];
const PANIC_MAX_REPLIES_PER_MINUTE = 10;
const PANIC_COOLDOWN_PER_USER = 1000 * 60 * 5; // 5 minutes ignore if too many messages
const PANIC_MAX_USER_REPLIES = 3; // Max replies to same user in panic mode window
const userPanicReplies: Record<string, { count: number, lastTime: number }> = {};

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


    // 0. Buffer message
    await (prisma as any).whatsAppMessageBuffer.create({
      data: {
        phone: senderPhone,
        content: messageText || null,
        mimeType: mediaItem?.mime || null,
        base64: mediaItem?.base64 || null
      }
    });

    // 1. Lock check
    let chat = await prisma.whatsAppChat.findUnique({ where: { phone: senderPhone } });
    if (!chat) chat = await prisma.whatsAppChat.create({ data: { phone: senderPhone, history: [] } });

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

        // Collect IDs to delete
        const itemIds = bufferItems.map((i: any) => i.id);

        let aggregatedText = "";
        const aggregatedMedia: any[] = [];
        let hasImageInBatch = false;

        for (const item of bufferItems) {
          if (item.content) aggregatedText += (aggregatedText ? " " : "") + item.content;
          if (item.base64) {
            aggregatedMedia.push({ base64: item.base64, mime: item.mimeType, type: item.mimeType.startsWith('image') ? 'image' : 'audio' });
            if (item.mimeType.startsWith('image')) hasImageInBatch = true;
          }
        }

        if (!aggregatedText && aggregatedMedia.length === 0) {
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
          p.sizes.map((s) => `  * ${s.name}: $${s.price}`).join('\n')
        ).join('\n\n');

        const currentChat = await prisma.whatsAppChat.findUnique({ where: { phone: senderPhone } });
        let history: any[] = (currentChat?.history as any[]) || [];

        // --- HISTORY EXPIRATION (DAY CHANGE OR 2 HOURS) ---
        const lastUpdateDate = new Date(currentChat!.updatedAt);
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
        const isFreshConversation = history.length > 0 && new Date(currentChat!.updatedAt).getTime() > FIFTEEN_MINS_AGO;

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

        let timeStatus = "\n✅ ESTADO: OPERATIVO. Toma pedidos normalmente de 10:00 AM a 6:30 PM. Ignora cualquier mensaje de cierre anterior en el historial si la hora actual indica que estamos abiertos.";
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
          timeStatus = `\n⚠️ ESTADO: PRE-APERTURA (Son las ${hStr}:${mStr}). Atiende pero ACLARA que empezamos a las 10:00 AM.`;
        } else if (timeValue >= 18.5) {
          timeStatus = `\n⚠️ ESTADO: CERRADO (Son las ${hStr}:${mStr}). Ya pasaron las 6:30 PM. NO TOMES MÁS PEDIDOS HOY. Dile al cliente que volvemos mañana a las 10 AM.`;
        } else if (timeValue >= 18) {
          timeStatus = `\n⚠️ ESTADO: SOLO RECOGER (Son las ${hStr}:${mStr}). Ya pasaron las 6:00 PM. Únicamente pedidos para recoger en local y con PAGO POR TRANSFERENCIA/NEQUI anticipado.`;
        } else if (timeValue >= 16) {
          timeStatus = `\n⚠️ ESTADO: SOLO RECOGER (Son las ${hStr}:${mStr}). Ya pasaron las 4:00 PM. No hay domicilios disponibles hoy, solo pasar a recoger al local.`;
        }

        if (globalSettings?.isPickupOnlyActive) {
          timeStatus += "\n⚠️ AVISO CRÍTICO (MODO RECOGER ACTIVO): Actualmente SOLO aceptamos pedidos para RECOGER en el local. NO HAY DOMICILIOS bajo ninguna circunstancia. Debes INTEGRAR este aviso de forma natural y VARIADA en tu respuesta. NUNCA uses la misma frase dos veces.";
        }

        const systemInstruction = `Eres el asistente digital de "El buen comer", ubicado en Calle 6 #39A-06 Entrada del barrio Rockefeller, Buenaventura. La fecha y hora actual es: ${currentDate}. Estás atendiendo por WhatsApp.${timeStatus}

REGLA DE ORO ANTI-SPAM: PARA EVITAR RESTRICCIONES DE WHATSAPP, NUNCA RESPONDAS EXACTAMENTE IGUAL A DOS CLIENTES. VARÍA SIEMPRE LA ESTRUCTURA, EL TONO, LAS PALABRAS Y EL USO DE EMOJIS. USA LOS GUIONES SIGUIENTES SÓLO COMO BASE DE INFORMACIÓN, NO COMO TEXTO LITERAL OBLIGATORIO (A MENOS QUE SE INDIQUE LO CONTRARIO).

SIMULACIÓN HUMANA: Si tienes varias cosas que decir (ej: saludar y luego preguntar algo), separa los párrafos con DOBLE SALTO DE LÍNEA (\n\n). El sistema se encargará de enviarlos como mensajes independientes para que parezca una conversación real.

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
CÁLCULO DE TOTALES Y BARRIOS DESCONOCIDOS:
 - Suma el precio de CADA producto según su tamaño + costo de domicilio.
 - **BARRIO DESCONOCIDO**: Si el cliente menciona un barrio que NO ESTÁ en la lista superior, usa un costo de domicilio estándar de $6.000. NO digas "Ya te confirmamos cuanto es", simplemente procede con el pedido usando ese valor.
 - **COSTO MANUAL (IMPORTANTE)**: Revisa el historial de mensajes. Si ves que un humano (model) envió un mensaje que es simplemente un número (ej: "5500") después de que preguntaras por un barrio desconocido, interpreta ese número como el 'deliveryFee' para ese pedido y procede.
 - El TOTAL final que menciones debe ser la suma EXACTA de (Productos + Domicilio). Si es recoger, el total es solo el de los productos ($0 domicilio).

1. **BREVEDAD ABSOLUTA (HUMANO REAL)**: Prioriza respuestas de 1 a 3 PALABRAS. Si puedes responder con una sola palabra (Ej: "Listo", "Ok", "Dale", "Perfecto", "Bueno"), HAZLO. NUNCA uses cortesía, agradecimientos largos ni frases de relleno. 
   - ⚠️ SEGURIDAD: Varía siempre esa palabra única entre un cliente y otro para evitar bloqueos por spam.
2. **AISLAMIENTO DE PEDIDO**: Si el bot confirmó orden (intent "order"), ignora platos anteriores. Nuevo mensaje = Pedido Nuevo.
3. **INVENTARIO Y PRECIOS**: ${menuText}
3.1. **MAPEO ARROZ CHINO**: 
   - Chino + Tradicional/Solo -> "Arroz Chino"
   - Chino + Costilla -> "Arroz con Costilla"
   - Chino + Chuleta -> "Arroz con Chuleta"
3.2. **TAMAÑOS**: Si no dicen tamaño, pregunta "¿De qué tamaño?".
4. **DOMICILIOS**: 
   - $4.000: Rockefeller, Modelo, Maeugenia, Bellavista, Tamarindo, Juan 23, Porvenir, Eucaristico, 14 Julio.
   - $5.000: Cristal, Oriente, Transformadora, Galeón, Miraflores, Masamorra, San Luis, Kennedy, El 5.
   - $6.000: Marina, R9, Laureles, Inmaculada, Ciudadela 1/2, Campin, Km 5, Centro, o BARRIO DESCONOCIDO.
   - $7.000: Ciudadela 3/4, Pino, 12 Abril, Independencia, Bolivar, Grancolombia, Santa Cruz, Isla, Cascajal, La ciudadela.
   - $8.000: Éxito, Triunfo, Nueva Grana, Brisas.
   - $9.000: Colinas C.
5. **RECOLECCIÓN (LISTA CORTA)**: Pide solo lo que falte:
   - Nombre
   - Dirección/Barrio
   - Pago
6. **TRANSFERENCIA**: Da el Nequi 3173941189 o la llave @NEQUILUI57354. Pide la imagen ANTES DE GENERAR LA ORDEN.
7. **VALIDACIÓN DE COMPROBANTE (OBLIGATORIO)**: Cuando envíen la imagen, DEBES verificar visualmente en la captura:
   - **NÚMERO DE DESTINO**: Debe ser obligatoriamente el **3173941189**.
   - **FECHA**: Debe ser la fecha de HOY (${currentDate}).
   - **MONTO**: Puede ser el total o una parte. Si es una parte, DEBES mencionar brevemente cuánto falta por pagar en efectivo.
   - Si el número de destino es diferente o la fecha es vieja, RECHAZA el pago de inmediato.
8. **CONFIRMACIÓN FINAL**: Solo si el comprobante es válido (intent "order"), confirma brevemente y da el tiempo de entrega (50-60 min domi / 20-30 min recoger).
9. **ANTI-HALLUCINATION**: Si no hay etiqueta "[Imagen...]", NO confirmes nada.
10. **AUDIOS**: Indica que solo texto, breve.
11. **CAMBIOS**: Solo primeros 5 min. Si pasa, di que ya entró a preparación.

FORMATO DE SALIDA (ESTRICTO JSON):
{
  "intent": "chat" | "order" | "send_menu",
  "replyText": "Respuesta variada. Usa \n\n para separar mensajes si quieres enviar más de uno.",
  "orderData": {    // SÓLO si intent es "order"
    "customerName": "...",
    "customerAddress": "...",
    "customerPhone": "...",
    "deliveryFee": 3000, 
    "notes": "...",
    "items": [
      { "productName": "...", "sizeName": "...", "quantity": 1, "notes": "..." }
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

        const preliminaryHistory = JSON.parse(JSON.stringify([...history, { role: "user", text: (aggregatedText || "") + (aggregatedMedia.length > 0 ? " [Contenía multimedia]" : "") }]));
        await (prisma as any).whatsAppChat.update({ where: { phone: senderPhone }, data: { history: preliminaryHistory.slice(-50) } });

        // Ensure history starts with a 'user' message and is very compact (last 6-8 turns max)
        let safeHistory = preliminaryHistory.slice(-10).map((h: any) => ({ role: h.role, parts: [{ text: h.text }] }));
        while (safeHistory.length > 0 && safeHistory[0].role !== "user") {
          safeHistory.shift();
        }

        // Tiered Model Fallback (Primary: 2.5 Flash -> Fallback 1: 3 Flash -> Fallback 2: 2.5 Pro)
        const fallbackModels = ["gemini-2.5-flash", "gemini-3-flash", "gemini-2.5-pro"];
        let geminiResponse: any = null;

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

            // Individual user limit (Hardened Panic: Only ONE reply per session)
            const userRef = userPanicReplies[senderPhone] || { count: 0, lastTime: 0 };
            if (userRef.count >= 1) {
              console.log(`[WhatsApp Bot] Panic: User ${senderPhone} already received the rejection notice. Ignoring.`);
              // CRITICAL: Clear buffer so these ignored messages don't reappear when Normal Mode returns
              await (prisma as any).whatsAppMessageBuffer.deleteMany({ where: { id: { in: itemIds } } });
              break;
            }

            userRef.count = 1;
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

          const hallucinatedConfirmation = (
            /comprobante.*(recibido|confirmado|aprobado|correcto)/i.test(geminiResponse.replyText || "") ||
            /transferencia.*(recibida|confirmada|aprobada)/i.test(geminiResponse.replyText || "") ||
            /pago.*recibido/i.test(geminiResponse.replyText || "") ||
            /pedido.*(confirmado|listo para preparar)/i.test(geminiResponse.replyText || "")
          ) && isTransfer && !imagePresent;

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
          } else if (geminiResponse.intent === "chat" && geminiResponse.replyText?.toLowerCase().includes("comprobante") && geminiResponse.orderData?.items?.length > 0 && imagePresent) {
            // Bot was right to confirm, but used wrong intent
            console.warn(`[WhatsApp Bot] Intent misclassification alert for ${senderPhone}. Correcting to 'order'.`);
            geminiResponse.intent = "order";
          }

          // --- TYPING INDICATOR: show "escribiendo..." before sending ---
          const textLength = geminiResponse.replyText?.length || 20;
          const typingDuration = Math.min(7000, Math.floor(Math.random() * 2000) + 1500 + (textLength * 25)); // Dynamic duration
          await sendTypingIndicator(remoteJid, typingDuration);
          await new Promise(r => setTimeout(r, typingDuration)); // Wait for typing to show

          if (geminiResponse.intent === "send_menu") {
            await sendWhatsAppMedia(remoteJid, undefined, geminiResponse.replyText);
          }
          else {
            // Fragmenatación de mensajes: dividir por doble salto de línea
            const textToSplit = geminiResponse.replyText || "";
            const messageChunks = textToSplit.split("\n\n").map((c: string) => c.trim()).filter((c: string) => c.length > 0);

            for (let i = 0; i < messageChunks.length; i++) {
              await sendWhatsAppMessage(remoteJid, messageChunks[i]);

              // Small delay between chunks to appear more human, except for the last one
              if (i < messageChunks.length - 1) {
                const chunkDelay = Math.floor(Math.random() * 2500) + 1000; // 1-3.5s
                console.log(`[WhatsApp Bot] Fragmentation delay: waiting ${chunkDelay}ms before next chunk for ${senderPhone}`);
                await new Promise(r => setTimeout(r, chunkDelay));
                await sendTypingIndicator(remoteJid, chunkDelay + 800); // Keep typing indicator alive
              }
            }
          }

          // Update global reply timestamp
          lastGlobalReplyTime = Date.now();

          const finalHistory = JSON.parse(JSON.stringify([...preliminaryHistory, { role: "model", text: JSON.stringify(geminiResponse) }].slice(-50)));
          await (prisma as any).whatsAppChat.update({ where: { phone: senderPhone }, data: { history: finalHistory } });

          if (geminiResponse.intent === "order" && geminiResponse.orderData && geminiResponse.orderData.items?.length > 0) {
            const od = geminiResponse.orderData;
            const settings = await (prisma.globalSettings as any).findUnique({ where: { id: 1 } });
            // Try to use the active waiter logged into the POS, but ONLY if they have the WAITER role
            let user: any = null;
            if (settings?.activeWaiterId) {
              user = await prisma.user.findFirst({
                where: { id: Number(settings.activeWaiterId), role: { in: ["WAITER", "CASHIER"] } }
              });
            }
            // Fallback to the first available WAITER or CASHIER in the database
            if (!user) user = await prisma.user.findFirst({ where: { role: { in: ["WAITER", "CASHIER"] } } });
            // Absolute fallback to ANY user (safety) if no Waiters are found
            if (!user) user = await prisma.user.findFirst();

            const validItems: any[] = [];
            let total = 0;
            const normalizedProducts = products.map(p => ({ ...p, normalizedName: normalizeString(p.name) }));

            for (const i of od.items) {
              const inputProductName = normalizeString(i.productName || "");
              const p = normalizedProducts.find(x =>
                x.normalizedName === inputProductName ||
                x.normalizedName.includes(inputProductName) ||
                inputProductName.includes(x.normalizedName)
              );

              if (p && p.sizes && p.sizes.length > 0) {
                const inputSizeName = normalizeString(i.sizeName || "");
                const s = p.sizes.find(z => normalizeString(z.name) === inputSizeName) || p.sizes[0];

                validItems.push({
                  productId: p.id,
                  sizeName: s.name || "Personal",
                  quantity: Math.max(1, Number(i.quantity) || 1),
                  price: Number(s.price) || 0,
                  notes: i.notes || null
                });
                total += (Number(s.price) || 0) * (Math.max(1, Number(i.quantity) || 1));
              } else {
                console.warn(`[WhatsApp Bot] Product not matched or has no sizes: "${i.productName}" for ${senderPhone}`);
              }
            }

            if (validItems.length > 0 && user) {
              // FOR WHATSAPP: The absolute identifier for the chat is the sender's phone.
              // We must NOT allow Gemini to overwrite this for lookup purposes, or another
              // user mentioning the same contact phone could hijack this order.
              const lookupPhone = senderPhone;

              // If Gemini provided a DIFFERENT contact phone, we preserve it in notes but NOT as the primary key.
              let additionalNotes = od.notes || "";
              if (od.customerPhone && normalizarNumero(od.customerPhone) !== senderPhone) {
                additionalNotes += `\n[TELÉFONO CONTACTO: ${od.customerPhone}]`;
              }

              const orderSource = (globalSettings?.isPickupOnlyActive || od.customerAddress?.toLowerCase().includes("recoger") || !od.customerAddress) ? "TAKEAWAY" : "DELIVERY";

              // 1. Transaction to Create/Update Order
              let finalOrderId: number | null = null;
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
                  // Note: Re-stocking of old items is handled outside or per-item if needed.
                  // For simplicity in WhatsApp, we replace all items.
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
                isolationLevel: 'Serializable',
                timeout: 20000
              });

              // 2. Inventory Updates (Separate attempts, don't crash if recipe incomplete)
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
                      }
                    }
                  }
                } catch (invErr) {
                  console.error("[WhatsApp Bot] Inventory update failed but order was saved:", invErr);
                }
              }
              console.log(`[WhatsApp Bot] Order generated/updated successfully for ${senderPhone}`);
            } else {
              console.error(`[WhatsApp Bot] Order generation failed for ${senderPhone} - items Matched: ${validItems.length}/${od.items?.length}, user: ${!!user}`);
              // Notify admin of failure
              try {
                await sendWhatsAppMessage(`573223119008@s.whatsapp.net`, `[🚨 ERROR CRÍTICO]\nSe confirmó pedido a ${senderPhone} pero falló la creación en DB.\nProductos detectados: ${validItems.length} de ${od.items?.length}\nRevisar consola y manual.`);
              } catch (e) { }
            }
          }
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
