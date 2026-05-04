import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";
import { sendWhatsAppMessage, normalizarNumero, sendWhatsAppMedia } from "../../../lib/whatsapp";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 

// Throttling for admin alerts to avoid spam
let lastAlertTimestamp = 0;
const ALERT_COOLDOWN = 1000 * 60 * 15; // 15 minutes

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
    senderPhone = normalizarNumero(remoteJid);
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
      mediaItem = { type: 'image', mime: messageObj.imageMessage.mimetype, base64: body.base64 };
    } else if (messageObj.audioMessage) {
      mediaItem = { type: 'audio', mime: messageObj.audioMessage.mimetype, base64: body.base64 };
    } else if (messageObj.documentMessage) {
       messageText = messageObj.documentMessage.caption || "";
       if (messageObj.documentMessage.mimetype?.startsWith('image')) mediaItem = { type: 'image', mime: messageObj.documentMessage.mimetype, base64: body.base64 };
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
          await new Promise(r => setTimeout(r, 4000));
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
        const products = await prisma.product.findMany({ where: { isActive: true, isSoldOut: false }, include: { sizes: true } });
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


        // Timings
        const nowBogota = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
        const timeValue = nowBogota.getHours() + nowBogota.getMinutes() / 60;
        const currentDate = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });
        
        let timeStatus = "";
        if (timeValue < 10) timeStatus = "\n⚠️ ESTADO: CERRADO (abrimos a las 10:00 AM). RECHAZA PEDIDOS.";
        else if (timeValue >= 18.5) timeStatus = "\n⚠️ ESTADO: CERRADO (dejamos de tomar pedidos a las 6:30 PM).";
        else if (timeValue >= 18) timeStatus = "\n⚠️ ESTADO: SOLO RECOGER (pasaron 6:00 PM). PAGO TRANSFERENCIA OBLIGATORIO.";
        else if (timeValue >= 16) timeStatus = "\n⚠️ ESTADO: SOLO RECOGER (pasaron 4:00 PM).";

        const systemInstruction = `Eres el asistente de "El buen comer" en Buenaventura. Fecha: ${currentDate}. Atendiendo por WhatsApp.${timeStatus}
        MENU:\n${menuText}
        REGLAS:
        1. Saluda breve si el historial está vacío. 
        2. Respuestas BREVES (1-2 líneas).
        3. Pide tamaño si falta. Para Arroz Chino pide: Costilla, Chuleta o Tradicional.
        4. Pregunta Domicilio o Recoger. 
           - Domicilio: Cuesta $3.000-$8.000 según barrio. Pide Nombre, Telf, Dirección, Pago.
           - Recoger: $0 domicilio. Pide Nombre, Telf, Pago.
        5. Pagos: Efectivo o Transferencia (Nequi 3173941189).
        6. Si envían foto de transferencia: valida valor, destino y fecha. Si ok, confirma pedido.
        7. JSON SIEMPRE: { "intent": "chat"|"order"|"send_menu", "replyText": "...", "orderData": {...} }`;

        const messageParts: any[] = [{ text: aggregatedText }];
        for (const m of aggregatedMedia) {
          messageParts.push({ text: m.type === 'image' ? "[Imagen]" : "El usuario mandó un audio." });
          messageParts.push({ inlineData: { mimeType: m.mime, data: m.base64 } });
        }

        const preliminaryHistory = [...history, { role: "user", text: aggregatedText + (aggregatedMedia.length > 0 ? " [Contenía multimedia]" : "") }];
        await (prisma as any).whatsAppChat.update({ where: { phone: senderPhone }, data: { history: preliminaryHistory.slice(-50) } });

        // Gemini Call
        let geminiResponse: any = null;
        let tries = 3;
        while (tries > 0) {
          try {
            const session = model.startChat({ 
              systemInstruction: { role: "system", parts: [{ text: systemInstruction }] },
              generationConfig: { responseMimeType: "application/json" },
              history: preliminaryHistory.slice(0, -1).map(h => ({ role: h.role, parts: [{ text: h.text }] }))
            });
            const res = await session.sendMessage(messageParts);
            geminiResponse = JSON.parse(res.response.text().replace(/```json\n?|```\n?/g, "").trim());
            break;
          } catch(e) { tries--; await new Promise(r => setTimeout(r, 1000)); }
        }

        if (geminiResponse?.replyText) {
          if (geminiResponse.intent === "send_menu") await sendWhatsAppMedia(remoteJid, undefined, geminiResponse.replyText);
          else await sendWhatsAppMessage(remoteJid, geminiResponse.replyText);

          const finalHistory = [...preliminaryHistory, { role: "model", text: JSON.stringify(geminiResponse) }].slice(-50);
          await (prisma as any).whatsAppChat.update({ where: { phone: senderPhone }, data: { history: finalHistory } });

          // Order Logic
          if (geminiResponse.intent === "order" && geminiResponse.orderData && geminiResponse.orderData.items?.length > 0) {
            const od = geminiResponse.orderData;
            const settings = await (prisma.globalSettings as any).findUnique({ where: { id: 1 } });
            const user = (settings?.activeWaiterId ? await prisma.user.findUnique({ where: { id: settings.activeWaiterId } }) : null) || await prisma.user.findFirst({ where: { role: "ADMIN" } });
            
            const validItems: any[] = [];
            let total = 0;
            for (const i of od.items) {
              const p = products.find(x => x.name.toLowerCase() === i.productName.toLowerCase());
              if (p) {
                const s = p.sizes.find(z => z.name.toLowerCase() === i.sizeName.toLowerCase()) || p.sizes[0];
                validItems.push({ productId: p.id, sizeName: s.name, quantity: i.quantity, price: Number(s.price), notes: i.notes || null });
                total += Number(s.price) * i.quantity;
              }
            }

            if (validItems.length > 0 && user) {
              let pPhone = od.customerPhone || senderPhone;
              if (pPhone.startsWith("57") && pPhone.length > 10) pPhone = pPhone.substring(2);

              const existing = await prisma.order.findFirst({ where: { customerPhone: pPhone, status: { in: ["PENDING", "PREPARING"] }, createdAt: { gte: new Date(Date.now() - 4 * 3600000) } }, include: { items: true } });

              await prisma.$transaction(async (tx) => {
                let name = od.customerName || pushName || `WA: ${senderPhone}`;
                if (od.customerAddress?.toLowerCase().includes("recoger")) name = `Recoger - ${name.replace(/^Recoger - /, '')}`;

                if (existing) {
                  for (const oi of existing.items) {
                    const recs = await tx.recipe.findMany({ where: { productId: oi.productId, sizeName: oi.sizeName } });
                    for (const r of recs) await tx.ingredient.update({ where: { id: r.ingredientId }, data: { stock: { increment: Number(r.quantity) * oi.quantity } } });
                  }
                  await tx.orderItem.deleteMany({ where: { orderId: existing.id } });
                  await tx.order.update({ where: { id: existing.id }, data: { customerName: name, customerAddress: od.customerAddress, notes: od.notes, total: total + (Number(od.deliveryFee) || 0), deliveryFee: Number(od.deliveryFee) || 0, items: { create: validItems } } });
                } else {
                  await tx.order.create({ data: { userId: user.id, customerName: name, customerPhone: pPhone, customerAddress: od.customerAddress, source: 'WHATSAPP', total: total + (Number(od.deliveryFee) || 0), deliveryFee: Number(od.deliveryFee) || 0, notes: od.notes, items: { create: validItems } } });
                }

                for (const vi of validItems) {
                  const recs = await tx.recipe.findMany({ where: { productId: vi.productId, sizeName: vi.sizeName } });
                  for (const r of recs) await tx.ingredient.update({ where: { id: r.ingredientId }, data: { stock: { decrement: Number(r.quantity) * vi.quantity } } });
                }
              });
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
      try { await sendWhatsAppMessage(`573223119008@s.whatsapp.net`, `[⚠️ ALERT BOT]\nError: ${error.message}\nCliente: ${senderPhone}`); } catch(e) {}
    }
  }
  return NextResponse.json({ received: true });
}
