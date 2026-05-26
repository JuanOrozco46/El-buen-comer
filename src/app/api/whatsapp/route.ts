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

// Panic mode rate limiter: sliding window of reply timestamps
// Prevents mass-sending rejection messages that could trigger WhatsApp spam detection
let panicModeReplyTimestamps: number[] = [];
const PANIC_MAX_REPLIES_PER_MINUTE = 10;

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
          const updatedHistory = [...history, { role: "model", text: messageText }].slice(-50);
          await prisma.whatsAppChat.update({ where: { phone: senderPhone }, data: { history: updatedHistory, updatedAt: new Date() } });
          console.log(`[WhatsApp Bot] Manual message synced to history for ${senderPhone}`);
        }
      }
      return NextResponse.json({ received: true });
    }


    // 0. Buffer message
    await (prisma as any).whatsAppMessageBuffer.create({
      data: { phone: senderPhone, content: messageText, mimeType: mediaItem?.mime || null, base64: mediaItem?.base64 || null }
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
      let isFirstIteration = true;
      let loops = 0;

      while (loops < 5) {
        if (isFirstIteration) {
          // Random delay between 5-20 seconds to appear more human
          const humanDelay = Math.floor(Math.random() * 15000) + 5000;
          console.log(`[WhatsApp Bot] Waiting ${humanDelay}ms before processing for ${senderPhone}`);
          await new Promise(r => setTimeout(r, humanDelay));
          isFirstIteration = false;
        }

        const bufferItems = await (prisma as any).whatsAppMessageBuffer.findMany({ where: { phone: senderPhone }, orderBy: { createdAt: 'asc' } });
        if (bufferItems.length === 0) break;

        // Collect IDs to delete LATER
        const itemIds = bufferItems.map((i: any) => i.id);

        let aggregatedText = "";
        const aggregatedMedia: any[] = [];
        for (const item of bufferItems) {
          if (item.content) aggregatedText += (aggregatedText ? " " : "") + item.content;
          if (item.base64) aggregatedMedia.push({ base64: item.base64, mime: item.mimeType, type: item.mimeType.startsWith('image') ? 'image' : 'audio' });
        }

        if (!aggregatedText && aggregatedMedia.length === 0) break;

        // Fetch Fresh Data
        let products = await prisma.product.findMany({ where: { isActive: true, isSoldOut: false }, include: { sizes: true } });

        // Fresh Data fetched above already filters for isActive and isSoldOut

        const globalSettings = await (prisma.globalSettings as any).findUnique({ where: { id: 1 } });
        const menuText = products.map((p) => `- ${p.name} (${p.category}):\n` + p.sizes.map((s) => `  * ${s.name}: $${s.price}`).join('\n')).join('\n\n');

        const currentChat = await prisma.whatsAppChat.findUnique({ where: { phone: senderPhone } });
        let history: any[] = (currentChat?.history as any[]) || [];

        // --- HISTORY EXPIRATION (2 HOURS) ---
        const lastUpdate = new Date(currentChat!.updatedAt).getTime();
        const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
        if (lastUpdate < twoHoursAgo) {
          console.log(`[WhatsApp Bot] History expired (>2h) for ${senderPhone}. Resetting.`);
          history = [];
        }

        // --- NEW: Handle Receipt Only without history ---
        const isOnlyReceipt = aggregatedMedia.length > 0 && aggregatedMedia.every(m => m.type === 'image') && !aggregatedText;
        if (isOnlyReceipt && history.length === 0) {
          console.log(`[WhatsApp Bot] Detected receipt only with empty history for ${senderPhone}. Sending short confirmation.`);
          await sendTypingIndicator(remoteJid, 2000);
          await new Promise(r => setTimeout(r, 2000));
          await sendWhatsAppMessage(remoteJid, "Transferencia comprobada. ✅");

          const shortHistory = [
            { role: "user", text: "[Imagen de transferencia]" },
            { role: "model", text: JSON.stringify({ intent: "chat", replyText: "Transferencia comprobada. ✅" }) }
          ];
          await prisma.whatsAppChat.update({ where: { phone: senderPhone }, data: { history: shortHistory, updatedAt: new Date(), isProcessing: false } });
          await (prisma as any).whatsAppMessageBuffer.deleteMany({ where: { id: { in: itemIds } } });
          break; // Exit the loop
        }


        // Timings
        const nowBogota = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
        const timeValue = nowBogota.getHours() + nowBogota.getMinutes() / 60;
        const currentDate = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });

        let timeStatus = "";
        if (globalSettings?.isPanicModeActive) timeStatus = `\n⚠️ ESTADO: SATURADOS (BOTÓN DE PÁNICO ACTIVADO). RECHAZA TODOS LOS PEDIDOS. NO USES EL INTENT ORDER.
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
        else if (timeValue < 10) timeStatus = "\n⚠️ ESTADO: ANTES DE APERTURA. Toma el pedido normalmente pero AL CLIENTE SIEMPRE ACLÁRALE que su pedido se empezará a realizar a partir de las 10:00 AM. Si es un encargo para una hora específica, pon esa hora en las notas del pedido (notes).";
        else if (timeValue >= 18.5) timeStatus = "\n⚠️ ESTADO: CERRADO (dejamos de tomar pedidos a las 6:30 PM).";
        else if (timeValue >= 18) timeStatus = "\n⚠️ ESTADO: SOLO RECOGER (pasaron 6:00 PM). PAGO TRANSFERENCIA OBLIGATORIO.";
        else if (timeValue >= 16) timeStatus = "\n⚠️ ESTADO: SOLO RECOGER (pasaron 4:00 PM).";

        if (globalSettings?.isPickupOnlyActive) {
          timeStatus += "\n⚠️ AVISO IMPORTANTE: Actualmente SOLO estamos aceptando pedidos para RECOGER en el local. NO HAY DOMICILIOS. Asegúrate de que el cliente lo sepa. VARÍA la forma de decirlo cada vez.";
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
 - NO inventes precios. Si un producto no está en la lista, díselo al cliente.

1. **SALUDO E INFORMACIÓN**: Si el cliente dice hola o interactúa por primera vez (historial completamente vacío), DEBES usar el intent "send_menu" y responder saludando de forma natural (ej: "¡Hola! Bienvenido al Buen Comer, ¿qué te gustaría pedir?") y ofreciendo el menú. VARÍA EL SALUDO SIEMPRE. Si ya hay historial, no saludes de nuevo. Si el usuario pide la "Tabla", se refiere al "Menú", en cuyo caso también debes usar el intent "send_menu".
2. **BREVEDAD (REGLA CRÍTICA)**: Tus respuestas deben ser EXTREMADAMENTE CORTAS. Máximo 1-2 líneas. NUNCA uses frases de cortesía como "¡Claro!", "¡Con gusto!".
3. **TAMAÑOS**: Si el cliente pide un arroz pero no especifica el tamaño, pregúntale: "¿De qué tamaño sería?".
3.1. **ARROZ CHINO (OBLIGATORIO)**: Si el cliente pide "Arroz Chino", DEBES preguntar si lo desea con Costilla, Chuleta o Tradicional (Solo).
3.2. **MAPEO DE PRODUCTOS (IMPORTANTE)**: Para evitar cobros adicionales incorrectos, usa los siguientes nombres de producto exactos (aplica para TODOS los tamaños):
   - "Arroz Chino" + "Tradicional" o "Solo" -> Usa productName: "Arroz Chino"
   - "Arroz Chino" + "Costilla" -> Usa productName: "Arroz con Costilla" (NO agregues "Costilla (Adición)")
   - "Arroz Chino" + "Chuleta" -> Usa productName: "Arroz con Chuleta" (NO agregues "Chuleta (Adición)")
   - Solo usa productos de la categoría "Adiciones" si el cliente pide explícitamente una "adición", "extra" o "porción adicional" de algo. Si el cliente pide un ingrediente que ya es parte del plato pero lo pide "aparte" (ej: "chicharrón aparte", "costilla aparte"), NO lo cobres como adición, ponlo como una nota en el producto.
4. **RECOLECCIÓN DE DATOS (OBLIGATORIO - REGLA DE ORO)**: NO puedes usar el intent "order" NI confirmar el pedido hasta que tengas los datos siguientes:
   a) Nombre del cliente.
   b) Teléfono de contacto.
   c) Dirección Completa y Barrio (IMPORTANTE: Si no identificas el barrio, PREGUNTA por él para calcular el valor del domicilio).
   d) Método de pago (Efectivo o Transferencia).
   e) COMPROBANTE: Si el método de pago es TRANSFERENCIA, ES OBLIGATORIO que el cliente envíe la imagen del comprobante ANTES de que uses el intent "order".
   - Si falta CUALQUIERA, sigue preguntando de forma breve.
   - Si es para Domicilio: Pide Nombre, Teléfono, Dirección, y método de pago.
   - Si es Pasar a Recoger: Pide SOLO Nombre, Teléfono y método de pago. NO PIDAS DIRECCIÓN.
4.1. **PAGOS MIXTOS / DIVIDIDOS**: Si el cliente divide el pago (ej. una parte en efectivo y otra por Nequi), ACEPTA la orden sin problema y regístralo claramente en las 'notes' del JSON de la orden (ej: "Pago dividido: 40 Efectivo, 32 Nequi").
5. **CIERRE CON EFECTIVO**:
    - Si es domicilio: Informa el [TOTAL] y el costo de domicilio. Agradece la compra y menciona que tienen 5 minutos para cambios antes de que pase a preparación. Varía la frase para que no parezca un mensaje automático.
    - Si es recoger: Informa el [TOTAL]. Agradece la compra y menciona la regla de los 5 minutos para cambios. Varía la redacción.
6. **PAGO CON TRANSFERENCIA**: Si el cliente indica que pagará por transferencia, informa el [TOTAL] y proporciona los datos de Nequi: 3173941189 o la llave @nequilui57354. Pide el comprobante para procesar el pedido. VARÍA las palabras.
7. **VALIDACIÓN DE COMPROBANTES (IMÁGENES)**: Cuando el cliente envíe una captura de pantalla de transferencia, verifica: Valor, Destino y Fecha.
    - Si es válida y el total coincide, DEBES usar el intent "order" (NUNCA uses "chat" para una confirmación) y confirma que recibiste el comprobante correctamente. Menciona que el pedido ha sido confirmado y la regla de los 5 minutos para cambios. VARÍA LA RESPUESTA de un cliente a otro.
8. **MEMORIA Y CONTEXTO**: NO vuelvas a preguntar el nombre, dirección o teléfono si el usuario ya lo mencionó.
9. **TIEMPOS DE ENTREGA**:
   - Domicilio: "Su pedido demorara 50-60 minutos aproximadamente."
   - Recoger: "Puedes pasar en unos 20-30 minutos aproximadamente."
10. **NOTAS POR PLATO**: Pon indicaciones en la propiedad "notes" del item.
11. **NOTAS DE VOZ**: Si recibes el texto "El usuario mandó un audio.", informa amablemente que por políticas no se toman pedidos por notas de voz, solo por texto. VARÍA la respuesta.
12. **CAMBIOS EN EL PEDIDO**: Informa al cliente que solo tiene 5 minutos para realizar cambios después de la confirmación. Si el cliente intenta cambiar algo después de 5 minutos, dile de forma variada y amable que el pedido ya entró a preparación.

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

        const preliminaryHistory = [...history, { role: "user", text: aggregatedText + (aggregatedMedia.length > 0 ? " [Contenía multimedia]" : "") }];
        await (prisma as any).whatsAppChat.update({ where: { phone: senderPhone }, data: { history: preliminaryHistory.slice(-50) } });

        // Ensure history starts with a 'user' message for Gemini
        let safeHistory = preliminaryHistory.slice(0, -1).map((h: any) => ({ role: h.role, parts: [{ text: h.text }] }));
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
            panicModeReplyTimestamps = panicModeReplyTimestamps.filter(t => now - t < 60000);
            if (panicModeReplyTimestamps.length >= PANIC_MAX_REPLIES_PER_MINUTE) {
              console.log(`[WhatsApp Bot] Panic rate limit reached (${PANIC_MAX_REPLIES_PER_MINUTE}/min). Skipping reply to ${senderPhone}`);
              break; // Exit the processing loop silently
            }
            panicModeReplyTimestamps.push(now);
          }

          // --- GLOBAL QUEUE: wait if another reply was sent too recently ---
          const now2 = Date.now();
          const timeSinceLastReply = now2 - lastGlobalReplyTime;
          if (timeSinceLastReply < MIN_INTER_USER_DELAY) {
            const extraWait = MIN_INTER_USER_DELAY - timeSinceLastReply + Math.floor(Math.random() * 2000);
            console.log(`[WhatsApp Bot] Global queue: waiting ${extraWait}ms before replying to ${senderPhone}`);
            await new Promise(r => setTimeout(r, extraWait));
          }

          // --- TYPING INDICATOR: show "escribiendo..." before sending ---
          const textLength = geminiResponse.replyText?.length || 20;
          const typingDuration = Math.min(7000, Math.floor(Math.random() * 2000) + 1500 + (textLength * 25)); // Dynamic duration
          await sendTypingIndicator(remoteJid, typingDuration);
          await new Promise(r => setTimeout(r, typingDuration)); // Wait for typing to show

          if (geminiResponse.intent === "send_menu") {
            await sendWhatsAppMedia(remoteJid, undefined, geminiResponse.replyText);

            // Extra message if Pickup Only is active
            if (globalSettings?.isPickupOnlyActive) {
              const pickupMessages = [
                "⚠️ *AVISO:* Por ahora solo estamos recibiendo pedidos para *RECOGER* en el local. ¡Te esperamos!",
                "🛵 *Nota:* En este momento no contamos con domiciliarios, solo estamos entregando pedidos para *recoger*.",
                "📍 *Atención:* Solo tenemos disponible la opción de *recoger* en el restaurante por ahora. No hay domicilios activos.",
                "🥘 Por el momento solo estamos manejando pedidos para *RECOGER*. Si deseas, puedes pasar por el tuyo al local en un momento.",
                "🚫 Estamos sin domicilios ahora mismo. Únicamente pedidos para *recoger* en el punto físico disponibles."
              ];
              const randomMessage = pickupMessages[Math.floor(Math.random() * pickupMessages.length)];

              // Brief delay before the extra message
              await new Promise(r => setTimeout(r, 2000));
              await sendWhatsAppMessage(remoteJid, randomMessage);
            }
          }
          else {
            // Fragmenatación de mensajes: dividir por doble salto de línea
            const textToSplit = geminiResponse.replyText || "";
            const messageChunks = textToSplit.split("\n\n").map((c: string) => c.trim()).filter((c: string) => c.length > 0);

            for (let i = 0; i < messageChunks.length; i++) {
              await sendWhatsAppMessage(remoteJid, messageChunks[i]);
              
              // Small delay between chunks to appear more human, except for the last one
              if (i < messageChunks.length - 1) {
                const chunkDelay = Math.floor(Math.random() * 1500) + 1000; // 1-2.5s
                console.log(`[WhatsApp Bot] Fragmentation delay: waiting ${chunkDelay}ms before next chunk for ${senderPhone}`);
                await new Promise(r => setTimeout(r, chunkDelay));
                await sendTypingIndicator(remoteJid, chunkDelay + 500); // Keep typing indicator alive
              }
            }
          }

          // Update global reply timestamp
          lastGlobalReplyTime = Date.now();

          const finalHistory = [...preliminaryHistory, { role: "model", text: JSON.stringify(geminiResponse) }].slice(-50);
          await (prisma as any).whatsAppChat.update({ where: { phone: senderPhone }, data: { history: finalHistory } });

          // --- INTENT SAFEGUARD: If bot confirmed in text but used 'chat' intent ---
          if (geminiResponse.intent === "chat" && geminiResponse.replyText?.includes("Comprobante recibido correctamente")) {
            console.warn(`[WhatsApp Bot] Intent misclassification alert for ${senderPhone}. Correcting to 'order'.`);
            if (geminiResponse.orderData && geminiResponse.orderData.items?.length > 0) {
              geminiResponse.intent = "order";
            } else {
              console.error(`[WhatsApp Bot] CRITICAL: Confirmation sent but orderData is missing for ${senderPhone}.`);
              try { await sendWhatsAppMessage(`573223119008@s.whatsapp.net`, `[🚨 ERROR BOT]\nSe confirmó recibo al cliente ${senderPhone} pero NO se generó orden en sistema.\nRevisar manual.`); } catch (e) { }
            }
          }

          if (geminiResponse.intent === "order" && geminiResponse.orderData && geminiResponse.orderData.items?.length > 0) {
            const od = geminiResponse.orderData;
            const settings = await (prisma.globalSettings as any).findUnique({ where: { id: 1 } });
            // Try to use the active waiter logged into the POS, but ONLY if they have the WAITER role
            let user: any = null;
            if (settings?.activeWaiterId) {
              user = await prisma.user.findFirst({
                where: { id: settings.activeWaiterId, role: { in: ["WAITER", "CASHIER"] } }
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
              const inputProductName = normalizeString(i.productName);
              const p = normalizedProducts.find(x =>
                x.normalizedName === inputProductName ||
                x.normalizedName.includes(inputProductName) ||
                inputProductName.includes(x.normalizedName)
              );

              if (p) {
                const inputSizeName = normalizeString(i.sizeName);
                const s = p.sizes.find(z => normalizeString(z.name) === inputSizeName) || p.sizes[0];
                validItems.push({ productId: p.id, sizeName: s.name, quantity: Number(i.quantity) || 1, price: Number(s.price), notes: i.notes || null });
                total += Number(s.price) * (Number(i.quantity) || 1);
              } else {
                console.warn(`[WhatsApp Bot] Product not matched: "${i.productName}" for ${senderPhone}`);
              }
            }

            if (validItems.length > 0 && user) {
              let pPhone = od.customerPhone || senderPhone;
              if (pPhone.startsWith("57") && pPhone.length > 10) pPhone = pPhone.substring(2);

              const existing = await prisma.order.findFirst({ where: { customerPhone: pPhone, status: { in: ["PENDING", "PREPARING"] }, createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } }, include: { items: true } });

              const orderSource = (globalSettings?.isPickupOnlyActive || od.customerAddress?.toLowerCase().includes("recoger") || !od.customerAddress) ? "TAKEAWAY" : "DELIVERY";

              await prisma.$transaction(async (tx) => {
                let name = od.customerName || pushName || `WA: ${senderPhone}`;
                if (od.customerAddress?.toLowerCase().includes("recoger")) name = `Recoger - ${name.replace(/^Recoger - /, '')}`;

                if (existing) {
                  for (const oi of existing.items) {
                    const recs = await tx.recipe.findMany({ where: { productId: oi.productId, sizeName: oi.sizeName } });
                    for (const r of recs) await tx.ingredient.update({ where: { id: r.ingredientId }, data: { stock: { increment: Number(r.quantity) * oi.quantity } } });
                  }
                  await tx.orderItem.deleteMany({ where: { orderId: existing.id } });
                  await tx.order.update({ where: { id: existing.id }, data: { customerName: name, customerAddress: od.customerAddress, notes: od.notes, total: total, deliveryFee: Number(od.deliveryFee) || 0, source: orderSource, status: "PENDING", items: { create: validItems } } });
                } else {
                  await tx.order.create({ data: { userId: user.id, customerName: name, customerPhone: pPhone, customerAddress: od.customerAddress, source: orderSource, status: "PENDING", total: total, deliveryFee: Number(od.deliveryFee) || 0, notes: od.notes, items: { create: validItems } } });
                }

                for (const vi of validItems) {
                  const recs = await tx.recipe.findMany({ where: { productId: vi.productId, sizeName: vi.sizeName } });
                  for (const r of recs) await tx.ingredient.update({ where: { id: r.ingredientId }, data: { stock: { decrement: Number(r.quantity) * vi.quantity } } });
                }
              });
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
        // 4. Finally, clear the buffered messages we just processed
        await (prisma as any).whatsAppMessageBuffer.deleteMany({ where: { id: { in: itemIds } } });
        await new Promise(r => setTimeout(r, 500));
      }
    } finally {
      await (prisma as any).whatsAppChat.update({ where: { phone: senderPhone }, data: { isProcessing: false } });
    }
  } catch (error: any) {
    console.error("[WhatsApp Webhook] General Error:", error);
    const isT = error.message?.includes("503") || error.message?.includes("Service Unavailable") || error.message?.includes("high demand") || error.message?.includes("fetch failed");
    if (!isT && Date.now() - lastAlertTimestamp > ALERT_COOLDOWN) {
      lastAlertTimestamp = Date.now();
      try { await sendWhatsAppMessage(`573223119008@s.whatsapp.net`, `[⚠️ ALERT BOT]\nError: ${error.message}\nCliente: ${senderPhone}`); } catch (e) { }
    }
  }
  return NextResponse.json({ received: true });
}
