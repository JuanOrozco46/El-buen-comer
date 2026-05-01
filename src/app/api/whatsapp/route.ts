import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";
import { sendWhatsAppMessage, formatOrderConfirmation, formatMenuMessage, normalizarNumero, sendWhatsAppMedia } from "../../../lib/whatsapp";

/**
 * GET /api/whatsapp
 * Health check & webhook verification (for Evolution API).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const verifyToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const mode = searchParams.get("hub.mode");

  // Standard webhook verification handshake
  if (mode === "subscribe" && verifyToken === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({
    status: "ok",
    service: "WhatsApp Integration — El buen comer",
    apiConfigured: !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY),
    timestamp: new Date().toISOString(),
  });
}

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

/**
 * POST /api/whatsapp
 * Webhook receiver for incoming WhatsApp messages from Evolution API.
 */
export async function POST(req: Request) {
  let senderPhone = "Desconocido";
  try {
    const body = await req.json();
    const event = body.event;

    if (event === "connection.update") {
      const state = body.data?.state || "unknown";
      console.log(`[WhatsApp] Connection update: ${state}`);
      return NextResponse.json({ received: true, connectionState: state });
    }

    console.log(`[WhatsApp Bot] Full event body:`, JSON.stringify(body, null, 2));

    if (event !== "messages.upsert") {
      return NextResponse.json({ received: true });
    }

    const messageData = body.data?.messages?.[0] || body.data;
    if (!messageData || messageData.key?.fromMe) {
      return NextResponse.json({ received: true });
    }

    // Ignore message reactions (emoji responses) - they are not real messages
    if (messageData.message?.reactionMessage || messageData.messageType === "reactionMessage") {
      console.log(`[WhatsApp Bot] Ignoring reaction message from ${messageData.key?.remoteJid}`);
      return NextResponse.json({ received: true });
    }

    const remoteJid = messageData.key?.remoteJid;
    const rawPhone = remoteJid?.replace(/@s.whatsapp.net|@g.us/, "");
    senderPhone = rawPhone ? normalizarNumero(rawPhone) : "Desconocido";
    const pushName = messageData.pushName || "";

    const messageText = messageData.message?.conversation ||
      messageData.message?.extendedTextMessage?.text ||
      messageData.message?.imageMessage?.caption ||
      messageData.message?.videoMessage?.caption || "";

    // Detección mejorada de medios (incluye mensajes efímeros)
    const getMessage = (m: any) => {
      if (m.message?.viewOnceMessage?.message) return m.message.viewOnceMessage.message;
      if (m.message?.viewOnceMessageV2?.message) return m.message.viewOnceMessageV2.message;
      return m.message;
    };
    const effectiveMessage = getMessage(messageData);

    const isImage = !!(effectiveMessage?.imageMessage);
    const isAudio = !!(effectiveMessage?.audioMessage);

    let base64Media: string | null = null;
    let mimeType: string = "";
    if (isImage) mimeType = "image/jpeg";
    if (isAudio) mimeType = effectiveMessage.audioMessage.mimetype || "audio/ogg";

    if (isImage || isAudio) {
      const apiUrl = process.env.EVOLUTION_API_URL;
      const apiKey = process.env.EVOLUTION_API_KEY;
      const instanceName = process.env.EVOLUTION_INSTANCE_NAME;
 
      if (apiUrl && apiKey && instanceName && messageData.key?.id) {
        try {
          console.log(`[WhatsApp Bot] Requesting base64 for ${isImage ? 'image' : 'audio'} message: ${messageData.key.id}`);
          const cleanUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
          const response = await fetch(`${cleanUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": apiKey
            },
            body: JSON.stringify({
              message: {
                key: messageData.key,
                message: effectiveMessage // Enviamos el mensaje efectivo (desenvolvedor de viewOnce)
              }
            })
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Evolution API Error: ${response.status} - ${errorText}`);
          }

          const data = await response.json();
          if (data && typeof data.base64 === "string") {
             console.log(`[WhatsApp Bot] Successfully retrieved base64 (${data.base64.length} chars)`);
             let rawBase64 = data.base64;
             const mimeMatch = rawBase64.match(/^data:([^;]+);base64,/);
             if (mimeMatch) {
                mimeType = mimeMatch[1];
             }
             base64Media = rawBase64.replace(/^data:[^;]+;base64,/, "");
          } else {
             console.warn(`[WhatsApp Bot] API returned success but NO base64 field found`, data);
          }
        } catch (e) {
             console.error(`[WhatsApp Bot] Error fetching base64 for ${isImage ? 'image' : 'audio'}:`, e);
        }
      }
    }

    // --- START DEBOUNCING LOGIC ---
    // 0. Save current message to buffer
    await (prisma as any).whatsAppMessageBuffer.create({
      data: {
        phone: senderPhone,
        content: messageText || null,
        mimeType: mimeType || null,
        base64: base64Media || null,
      }
    });

    // 1. Try to acquire lock with TTL (1 minute)
    // check if chat exists, if not create it
    let chat = await prisma.whatsAppChat.findUnique({ where: { phone: senderPhone } });
    if (!chat) {
      chat = await prisma.whatsAppChat.create({
        data: { phone: senderPhone, history: [] }
      });
    }

    const ONE_MINUTE_AGOO = new Date(Date.now() - 60000);
    
    // Check if it's currently processing and NOT STALE
    if ((chat as any).isProcessing && chat.updatedAt > ONE_MINUTE_AGOO) {
      console.log(`[WhatsApp Bot] Busy processing for ${senderPhone}. Buffering message.`);
      return NextResponse.json({ received: true });
    }

    // Attempt to set isProcessing = true (Atomic-ish)
    // If it was processing but stale (updatedAt < ONE_MINUTE_AGOO), we override it
    const lockAcquired = await (prisma as any).whatsAppChat.updateMany({
      where: { 
        phone: senderPhone, 
        OR: [
          { isProcessing: false },
          { updatedAt: { lt: ONE_MINUTE_AGOO } }
        ]
      },
      data: { isProcessing: true, updatedAt: new Date() }
    });

    if (lockAcquired.count === 0) {
      console.log(`[WhatsApp Bot] Lock collision or busy for ${senderPhone}.`);
      return NextResponse.json({ received: true });
    }

    try {
      // 2. Wait for more messages (Reduced to 3s to be safer on Vercel)
      console.log(`[WhatsApp Bot] Lock acquired for ${senderPhone}. Waiting 3s for more messages...`);
      await new Promise(resolve => setTimeout(resolve, 3000));

    // 3. Collect ALL buffered messages
    const bufferItems = await (prisma as any).whatsAppMessageBuffer.findMany({
      where: { phone: senderPhone },
      orderBy: { createdAt: 'asc' }
    });

    // Clear buffer immediately
    await (prisma as any).whatsAppMessageBuffer.deleteMany({
      where: { phone: senderPhone }
    });

    // Concatenate all text and collect all media
    let aggregatedText = "";
    const aggregatedMedia: { base64: string, mime: string, type: 'image' | 'audio' }[] = [];

    for (const item of bufferItems) {
      if (item.content) aggregatedText += (aggregatedText ? " " : "") + item.content;
      if (item.base64 && item.mimeType) {
        aggregatedMedia.push({
          base64: item.base64,
          mime: item.mimeType,
          type: item.mimeType.startsWith('image') ? 'image' : 'audio'
        });
      }
    }

    console.log(`[WhatsApp Bot] Aggregated content for ${senderPhone}: "${aggregatedText}" [Items: ${aggregatedMedia.length}]`);

    // --- END DEBOUNCING LOGIC ---

    // Hidden reset command for testing
    const resetKeywords = ["reiniciar", "reset", "borrar memoria", "limpiar chat"];
    if (resetKeywords.includes(aggregatedText.trim().toLowerCase())) {
       try {
           await (prisma as any).whatsAppChat.update({
             where: { phone: senderPhone },
             data: { history: [], isProcessing: false }
           });
           await sendWhatsAppMessage(remoteJid, "🔄 Memoria borrada con éxito. Empecemos de cero, dime en qué te puedo ayudar.");
       } catch(e) {}
       return NextResponse.json({ received: true, status: "reset" });
    }

    // 0. Check Panic Mode
    const settings = await prisma.globalSettings.findUnique({ where: { id: 1 } });
    if (settings?.isPanicModeActive) {
      await (prisma as any).whatsAppChat.update({ where: { phone: senderPhone }, data: { isProcessing: false } });
      await sendWhatsAppMessage(remoteJid, "Actualmente tenemos muchos pedidos en cola. Te avisaremos apenas podamos tomar más pedidos. Gracias por tu comprensión. 🙏");
      return NextResponse.json({ received: true, status: "panic_mode_active" });
    }

    // 1. Load active menu
    const products = await prisma.product.findMany({
      where: { isActive: true, isSoldOut: false },
      include: { sizes: true },
    });

    const menuText = products.map((p) =>
      `- ${p.name} (${p.category}):\n` + p.sizes.map((s) => `  * ${s.name}: $${s.price}`).join('\n')
    ).join('\n\n');

    // 2. Refresh Chat Record (Daily Reset Logic)
    const colombiaNow = new Date().toLocaleString("en-US", { timeZone: "America/Bogota" });
    const todayStr = new Date(colombiaNow).toDateString();

    let history: any[] = (chat?.history as any[]) || [];
    const lastUpdateStr = new Date(chat.updatedAt.toLocaleString("en-US", { timeZone: "America/Bogota" })).toDateString();
    
    if (lastUpdateStr !== todayStr) {
      console.log(`[WhatsApp Bot] New day detected for ${senderPhone}. Resetting history.`);
      history = [];
    }

    // 3. Prepare Gemini Prompt
    const nowBogota = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
    const currentHour = nowBogota.getHours();
    const currentMinutes = nowBogota.getMinutes();
    const timeValue = currentHour + currentMinutes / 60;
    const isPastDeliveryCutoff = timeValue >= 16;
    const isPastPickupCutoff = timeValue >= 18.5;
    
    let timeStatusMsg = "";
    if (isPastPickupCutoff) {
      timeStatusMsg = "\n⚠️ ESTADO: CERRADO (pasaron las 6:30 PM). RECHAZA TODOS LOS PEDIDOS amablemente y despídete.";
    } else if (isPastDeliveryCutoff) {
      timeStatusMsg = "\n⚠️ ESTADO: SOLO RECOGER (pasaron las 4:00 PM). RECHAZA DOMICILIOS amablemente. SÓLO ACEPTA pedidos para recoger.";
    }

    const currentDate = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });
    const systemInstruction = `Eres el asistente digital de "El buen comer", ubicado en Buenaventura. La fecha y hora actual es: ${currentDate}. Estás atendiendo por WhatsApp.${timeStatusMsg}

INVENTARIO ACTUAL Y PRECIOS:
${menuText}

PRECIOS DE DOMICILIO POR BARRIO:
- Rockefeller, Modelo, Maeugenia, Bellavista, Loma del Tamarindo, Juan 23, Porvenir, Eucaristico, 14 Julio: $3.000
- Cristal, Oriente, Transformadora, Galeón, Miraflores, Masamorra, San Luis, Kennedy, El 5: $4.000
- Marina, R9, Laureles, Inmaculada, Ciudadela 1 y 2: $5.000
- Ciudadela 3 y 4, Pino, 12 Abril, Independencia, Bolivar, Grancolombia, Santa Cruz, Todo Isla: $6.000
- Éxito, Triunfo, Nueva Grana, Brisas Del Mar: $7.000
- Colinas C.: $8.000

- Super familiar: Para 6 o 7 personas.
 
 CÁLCULO DE TOTALES (REGLA DE ORO):
 - Suma el precio de CADA producto según su tamaño.
 - Suma el costo de domicilio según el barrio.
 - El TOTAL final que menciones debe ser la suma EXACTA de (Productos + Domicilio).
 - NO inventes precios. Si un producto no está en la lista, díselo al cliente.
 - Muestra siempre el desglose si el cliente lo pide.

REGLAS Y GUIONES DE OPERACIÓN (SÍGUELOS ESTRICTAMENTE):
1. **SALUDO E INFORMACIÓN**: Si el cliente dice hola o interactúa por primera vez (historial completamente vacío), DEBES usar el intent "send_menu" y responder EXACTAMENTE con: "Hola, soy el asistente del buen comer ¿qué deseas ordenar hoy?". Si el historial tiene la marca "PEDIDO_COMPLETADO" NO vuelvas a saludar. Si el cliente PIDE VER EL MENÚ / LA CARTA, usa el intent "send_menu" y una respuesta breve.
2. **BREVEDAD (REGLA CRÍTICA)**: Tus respuestas deben ser EXTREMADAMENTE CORTAS. Máximo 1-2 líneas. NUNCA uses frases de cortesía como "¡Claro!", "¡Con gusto!", "Entendido, tomaré nota de eso". Si el cliente da información adicional (ej: "que llegue después de las 12"), responde solamente "Listo." o "Ok." y nada más. Si ya tienes todos los datos para el pedido, procede directamente sin agregar relleno.
3. **TAMAÑOS**: Si el cliente pide un arroz pero no especifica el tamaño, pregúntale: "¿De qué tamaño sería?".
3.1. **ARROZ CHINO (OBLIGATORIO)**: Si el cliente pide "Arroz Chino", DEBES preguntar si lo desea con Costilla, Chuleta o Tradicional (Solo).
4. **RECOLECCIÓN DE DATOS**: Cuando el cliente defina el tamaño y pedido, revisa el historial para ver si ya dio sus datos. Si NO los tienes, dile EXACTAMENTE: "Listo confirmanos Nombre, Telefono, Direccion, Efectivo, transferencia o dividido". (Nota: Pregunta si es para Domicilio o Pasar a Recoger). Si YA los tienes, procede directamente al cierre.
5. **PAGOS MIXTOS / DIVIDIDOS**: Si el cliente divide el pago (ej. una parte en efectivo y otra por Nequi), ACEPTA la orden sin problema y regístralo claramente en las 'notes' del JSON de la orden (ej: "Pago dividido: 40 Efectivo, 32 Nequi").
6. **CIERRE CON EFECTIVO**: Si el pago incluye Efectivo, al crear el 'order' despídete EXACTAMENTE con: "Con mucho gusto serian [TOTAL]. Con el domicilio gracias por comprar en el buen comer."
7. **CIERRE CON TRANSFERENCIA**: Si el pago es todo o en parte por Nequi/Transferencia, dile EXACTAMENTE: "El total son [TOTAL]. Por favor realizar transferencia al Nequi 3173941189 o a la llave @nequilui57354. Envía el comprobante por este medio para verificar y procesar tu pedido inmediatamente."
8. **VALIDACIÓN DE COMPROBANTES (IMÁGENES)**: Cuando el cliente envíe una captura de pantalla de transferencia, DEBES analizarla cuidadosamente y verificar:
    - **Valor**: Debe coincidir exactamente con el total del pedido (+ domicilio).
    - **Destino**: Debe ser el Nequi 3173941189 o la llave @nequilui57354 (ignora mayúsculas/minúsculas).
    - **Fecha**: Debe ser la fecha de hoy (${currentDate}).
    - Si la imagen es válida y el total coincide, usa el intent "order".
    - Si la imagen NO es válida o el valor es menor, informa el error específico al cliente amablemente.
9. **MEMORIA Y CONTEXTO**: NO vuelvas a preguntar el nombre, dirección o teléfono si el usuario ya lo mencionó en mensajes anteriores del chat. Usa esa información para llenar el JSON de orderData.
9. **TIEMPOS DE ENTREGA (Obligatorio en todos los "order")**:
   - Si es domicilio, al final añade: "Su pedido demorara 50-60 minutos aproximadamente."
   - Si es recoger, al final añade: "Puedes pasar en unos 20-30 minutos aproximadamente."
10. **NOTAS POR PLATO**: Si piden retirar o agregar algo a un plato particular (ej. "sin cebolla"), SIEMPRE ponlo en la propiedad "notes" del item.
11. **CAMBIO DE PEDIDO**: Si el cliente cambia su pedido en medio del chat, ajusta mentalmente la orden sin problema.
12. **DIRECCIÓN**: Aunque preguntemos "Direccion", si el cliente solo da un barrio (como es costumbre en Buenaventura), acéptalo sin exigir calles exactas.
13. **COMPROBANTE SIN PEDIDO PREVIO (REGLA CRÍTICA)**: Si recibes una imagen de comprobante de pago pero el historial de conversación está VACÍO o NO tiene un pedido en curso, significa que el cliente tomó el pedido por llamada. En ese caso:
    - SOLO revisa que el destinatario sea el Nequi 3173941189 o la llave @nequilui57354.
    - Si el destinatario es correcto, responde ÚNICAMENTE: "Perfecto, comprobante recibido. ✅"
    - Si el destinatario es incorrecto, avísale amablemente.
    - NUNCA uses intent "order" en este caso. Siempre usa intent "chat".
14. **ESTADO DEL PEDIDO**: Si el cliente pregunta "¿Dónde va el domicilio?", "¿Cuánto falta?", o cualquier duda sobre el tiempo de entrega una vez confirmado el pedido, responde únicamente: "Ya está en camino. ✅"

FORMATO DE SALIDA (ESTRICTO JSON):
TU RESPUESTA SIEMPRE DEBE SER UN SÓLO OBJETO JSON VÁLIDO. NO ESCRIBAS TEXTO FUERA DEL JSON.
ESTRUCTURA:
{
  "intent": "chat" | "order" | "send_menu",
  "replyText": "Respuesta usando LOS GUIONES EXACTOS",
  "orderData": {    // SÓLO REQUERIDA si intent es "order", de lo contrario no la envíes
    "customerName": "Nombre",
    "customerAddress": "Dirección o barrio indicado (y si es Recoger pon 'Pasa a recoger')",
    "customerPhone": "Teléfono que dé el cliente, si no da usa el de whatsapp",
    "deliveryFee": 3000, // Costo de envío según la tabla de barrios
    "notes": "Notas del pago, ej: EFECTIVO o TRANSFERENCIA",
    "items": [
      {
        "productName": "Nombre exacto del producto según menú",
        "sizeName": "Nombre exacto del tamaño según menú",
        "quantity": 1,
        "notes": "Cualquier indicación u observación sobre el plato (ej: sin cebolla). Pon null si no hay notas."
      }
    ]
  }
}

Usa intent "chat" para conversar, "order" para el cierre final y "send_menu" para enviar la carta. En replyText informa siempre del total final (productos + domicilio) al usar "order".`;

    // 4. Build chat context and run Gemini
    // Sanitize history: Gemini requires history to start with 'user' role
    const sanitizedHistory = history.filter((_, i) => {
      if (i === 0 && history[0]?.role !== "user") return false;
      return true;
    });

    const chatSession = model.startChat({
      systemInstruction: {
        role: "system",
        parts: [{ text: systemInstruction }]
      },
      generationConfig: {
        responseMimeType: "application/json"
      },
      history: sanitizedHistory.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      }))
    });

    const messageParts: any[] = [];
    if (aggregatedText) messageParts.push({ text: aggregatedText });
    
    // Add all media items that were buffered
    for (const media of aggregatedMedia) {
      if (media.type === 'image') {
        messageParts.push({ text: "[Imagen adjunta]" });
      } else {
        messageParts.push({ text: "El usuario ha enviado un mensaje de voz pidiendo algo." });
      }
      
      messageParts.push({
        inlineData: {
          mimeType: media.mime,
          data: media.base64
        }
      });
    }

    console.log(`[WhatsApp Bot] Processing with Gemini 2.5-flash for ${senderPhone}...`);
    const result = await chatSession.sendMessage(messageParts);
    const responseText = result.response.text();
    console.log(`[WhatsApp Bot] Gemini response: ${responseText.substring(0, 100)}...`);
    let geminiResponse: any = null;

    try {
      // Remove any potential markdown json block formatting
      const cleanJson = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      geminiResponse = JSON.parse(cleanJson);
    } catch (e) {
      console.error("[WhatsApp Bot] Gemini returned invalid JSON:", responseText);
      await sendWhatsAppMessage(remoteJid, "Ups, estoy teniendo un problema técnico en mi sistema. Dame un momento y vuelve a escribirme. 😥");
      return NextResponse.json({ received: true, error: "json_parse" });
    }

    if (!geminiResponse || !geminiResponse.intent || !geminiResponse.replyText) {
      console.error("[WhatsApp Bot] Gemini response missing intent or replyText:", geminiResponse);
      return NextResponse.json({ received: true, error: "invalid_format" });
    }

    // Force send_menu intent if keywords found in user message
    const menuKeywords = ["menú", "menu", "carta", "la carta", "la carta", "el menú"];
    const includesMenu = menuKeywords.some(kw => messageText.toLowerCase().includes(kw));
    if (includesMenu && geminiResponse.intent === "chat") {
      console.log(`[WhatsApp Bot] Forcing send_menu intent due to keywords in: "${messageText}"`);
      geminiResponse.intent = "send_menu";
    }

    // 5. Save History
    const historyUserText = aggregatedText + (aggregatedMedia.length > 0 ? ` [Contenía ${aggregatedMedia.length} archivos multimedia]` : "");
    const newHistory = [
      ...history,
      { role: "user", text: historyUserText },
      { role: "model", text: JSON.stringify(geminiResponse) }
    ].slice(-50); // keep last 50 messages (daily context)

    await (prisma as any).whatsAppChat.update({
      where: { phone: senderPhone },
      data: { 
        history: newHistory,
        isProcessing: false // RELEASE LOCK
      }
    });
    console.log(`[WhatsApp Bot] History updated for ${senderPhone}`);

    // 6. Send Response to User via WhatsApp
    if (geminiResponse.intent === "send_menu") {
       console.log(`[WhatsApp Bot] Intent: send_menu detected. Sending media to ${remoteJid}...`);
       const success = await sendWhatsAppMedia(remoteJid || "", undefined, geminiResponse.replyText);
       if (!success) {
          console.error("[WhatsApp Bot] Failed to send menu via sendWhatsAppMedia");
       }
    } else {
       await sendWhatsAppMessage(remoteJid || "", geminiResponse.replyText);
    }

    // 7. If intent is order, create the Prisma order and deduct inventory
    if (geminiResponse.intent === "order" && geminiResponse.orderData && geminiResponse.orderData.items.length > 0) {

      // Code-level guard: block transfer orders without an image (receipt) in this request
      const notes = (geminiResponse.orderData.notes || "").toLowerCase();
      const isTransferOrder = notes.includes("transferencia") || notes.includes("nequi");
      if (isTransferOrder && aggregatedMedia.filter(m => m.type === 'image').length === 0) {
        console.warn(`[WhatsApp Bot] BLOCKED transfer order without receipt image for ${senderPhone}`);
        await sendWhatsAppMessage(remoteJid || "", "Necesito el comprobante de transferencia para confirmar el pedido. Por favor envíalo.");
        return NextResponse.json({ received: true, error: "transfer_without_receipt" });
      }

      // Priority: use the currently logged-in waiter. Fallback to ADMIN.
      const settings = await (prisma.globalSettings as any).findUnique({ where: { id: 1 } });
      const activeWaiterId = settings?.activeWaiterId;

      const systemUser = activeWaiterId
        ? await prisma.user.findUnique({ where: { id: activeWaiterId } })
        : null;
      
      const fallbackUser = systemUser ?? (
        await prisma.user.findFirst({ where: { role: "ADMIN" } }) ||
        await prisma.user.findFirst({ where: { role: "CASHIER" } })
      );

      if (!fallbackUser) {
        console.error("[WhatsApp] No user found to assign order");
        return NextResponse.json({ received: true, error: "no_system_user" });
      }

      console.log(`[WhatsApp Bot] Assigning order to: ${fallbackUser.name} (ID: ${fallbackUser.id})`);

      const orderData = geminiResponse.orderData;
      const deliveryFee = Number(orderData.deliveryFee) || 0;
      let orderTotal = 0; // START AT 0, NO DOMICILIO IN TOTAL!

      // Server-side validation: reject incomplete orders
      const resolvedPhone = orderData.customerPhone || senderPhone;
      if (!orderData.customerName || !resolvedPhone || resolvedPhone === "Desconocido") {
        console.error(`[WhatsApp Bot] BLOCKED incomplete order - missing name or phone. Name: "${orderData.customerName}", Phone: "${resolvedPhone}"`);
        // Ask gemini to re-collect missing data (don't create the order)
        await sendWhatsAppMessage(remoteJid || "", "Necesito tu nombre y teléfono para confirmar el pedido.");
        return NextResponse.json({ received: true, error: "incomplete_order_data" });
      }

      // Match items strictly with DB to get IDs and prices
      const validItems: { productId: number; sizeName: string; quantity: number; price: number; notes: string | null }[] = [];
      for (const reqItem of orderData.items) {
        const dbProduct = products.find(p => p.name.toLowerCase() === reqItem.productName.toLowerCase());
        if (dbProduct) {
          const dbSize = dbProduct.sizes.find(s => s.name.toLowerCase() === reqItem.sizeName.toLowerCase()) || dbProduct.sizes[0];
          const price = Number(dbSize.price);
          orderTotal += price * reqItem.quantity;
          validItems.push({
            productId: dbProduct.id,
            sizeName: dbSize.name,
            quantity: reqItem.quantity,
            price: price,
            notes: reqItem.notes || null
          });
        }
      }

      // Ensure phone number strips country code 57 for DB creation
      let finalPhone = orderData.customerPhone || senderPhone;
      if (finalPhone.startsWith("57") && finalPhone.length > 10) {
         finalPhone = finalPhone.substring(2);
      }

      if (validItems.length > 0) {
        const order = await prisma.$transaction(async (tx) => {
          const newOrder = await tx.order.create({
            data: {
              userId: fallbackUser.id,
              customerName: orderData.customerName || pushName || `WA: ${senderPhone}`,
              customerPhone: finalPhone,
              customerAddress: orderData.customerAddress || null,
              notes: orderData.notes || null,
              source: (orderData.customerAddress && orderData.customerAddress.toLowerCase().includes("recoger")) ? "TAKEAWAY" : "DELIVERY",
              status: "PENDING",
              total: orderTotal,
              deliveryFee: deliveryFee,
              items: {
                create: validItems.map(vi => ({
                  productId: vi.productId,
                  sizeName: vi.sizeName,
                  quantity: vi.quantity,
                  price: vi.price,
                  notes: vi.notes,
                })),
              },
            } as any,
            include: { items: { include: { product: true } } },
          });

          // Automated Stock Deduction
          for (const item of validItems) {
            const recipes = await tx.recipe.findMany({
              where: {
                productId: item.productId,
                sizeName: item.sizeName
              }
            });

            for (const recipe of recipes) {
              const deduction = Number(recipe.quantity) * Number(item.quantity);
              await tx.ingredient.update({
                where: { id: recipe.ingredientId },
                data: { stock: { decrement: deduction } }
              });
              await tx.inventoryLog.create({
                data: {
                  ingredientId: recipe.ingredientId,
                  amount: deduction,
                  type: 'OUT',
                  reason: `WhatsApp Bot Orden #${newOrder.id}`
                }
              });
            }
          }

          return newOrder;
        });

        // Mark conversation as completed with valid user/model pair
        // (Gemini requires history to start with 'user' role - never store model-only history)
        await (prisma as any).whatsAppChat.update({
          where: { phone: senderPhone },
          data: { history: [
            { role: "user", text: "[pedido confirmado]" },
            { role: "model", text: "PEDIDO_COMPLETADO" }
          ] }
        });

        console.log(`[WhatsApp Bot] Order #${order.id} generated completely.`);
      } else {
        console.error("[WhatsApp Bot] Failed to match any items from the JSON payload:", orderData.items);
      }
    }

    return NextResponse.json({ received: true, status: "processed" });
  } finally {
    // 8. Release lock even if something crashed
    try {
      await (prisma as any).whatsAppChat.update({
        where: { phone: senderPhone },
        data: { isProcessing: false }
      });
      console.log(`[WhatsApp Bot] Lock released for ${senderPhone}`);
    } catch (e) {
      console.error(`[WhatsApp Bot] Failed to release lock for ${senderPhone}:`, e);
    }
  }
} catch (error: any) {
  console.error("[WhatsApp Webhook] General Error:", error);
  
  // Notify Admin about the error
  const ADMIN_PHONE = "573223119008";
  try {
     const errorPrefix = "[⚠️ ALERT BOT]";
     const errorMsg = `${errorPrefix}\n\nError detectado: ${error.message}\nCliente afectado: ${senderPhone || "Desconocido"}\n\nPor favor revisa el sistema.`;
     await sendWhatsAppMessage(`${ADMIN_PHONE}@s.whatsapp.net`, errorMsg);
  } catch(e) {
     console.error("[WhatsApp Bot] Failed to notify admin:", e);
  }

  return NextResponse.json({ received: true, error: error.message });
}
}
