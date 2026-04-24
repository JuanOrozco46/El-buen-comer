import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";
import { sendWhatsAppMessage, formatOrderConfirmation, formatMenuMessage, normalizarNumero } from "../../../lib/whatsapp";

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
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

/**
 * POST /api/whatsapp
 * Webhook receiver for incoming WhatsApp messages from Evolution API.
 */
export async function POST(req: Request) {
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

    const remoteJid = messageData.key?.remoteJid;
    const rawPhone = remoteJid?.replace(/@s.whatsapp.net|@g.us/, "");
    const senderPhone = normalizarNumero(rawPhone);
    const pushName = messageData.pushName || "";

    const messageText = messageData.message?.conversation ||
      messageData.message?.extendedTextMessage?.text ||
      messageData.message?.imageMessage?.caption ||
      messageData.message?.videoMessage?.caption || "";

    const messageType = messageData.messageType || Object.keys(messageData.message || {})[0];
    let base64Image: string | null = null;
    let mimeType: string = "image/jpeg";

    if (messageType === "imageMessage" || messageData.message?.imageMessage) {
      const apiUrl = process.env.EVOLUTION_API_URL;
      const apiKey = process.env.EVOLUTION_API_KEY;
      const instanceName = process.env.EVOLUTION_INSTANCE_NAME;

      if (apiUrl && apiKey && instanceName && messageData.key?.id) {
        try {
          const response = await fetch(`${apiUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": apiKey
            },
            body: JSON.stringify({
              message: {
                key: messageData.key,
                message: messageData.message
              }
            })
          });
          const data = await response.json();
          if (data && typeof data.base64 === "string") {
             let rawBase64 = data.base64;
             const mimeMatch = rawBase64.match(/^data:(image\/\w+);base64,/);
             if (mimeMatch) {
                mimeType = mimeMatch[1];
             }
             base64Image = rawBase64.replace(/^data:image\/\w+;base64,/, "");
          }
        } catch (e) {
             console.error("[WhatsApp Bot] Error fetching base64 for image:", e);
        }
      }
    }

    if (!remoteJid || (!messageText && !base64Image)) {
      return NextResponse.json({ received: true });
    }

    console.log(`[WhatsApp Bot] Message from ${pushName} (${senderPhone}): "${messageText}"${base64Image ? " [Contains Image]" : ""}`);

    // Hidden reset command for testing
    if (messageText.trim().toLowerCase() === "reiniciar") {
       try {
           await (prisma as any).whatsAppChat.update({
             where: { phone: senderPhone },
             data: { history: [] }
           });
           await sendWhatsAppMessage(remoteJid, "🔄 Memoria borrada con éxito. Empecemos de cero, dime en qué te puedo ayudar.");
       } catch(e) {}
       return NextResponse.json({ received: true, status: "reset" });
    }

    // 0. Check Panic Mode
    const settings = await prisma.globalSettings.findUnique({ where: { id: 1 } });
    if (settings?.isPanicModeActive) {
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

    // 2. Load or create chat history
    let chatRecord = await (prisma as any).whatsAppChat.findUnique({ where: { phone: senderPhone } });
    let history: any[] = [];
    if (chatRecord && chatRecord.history) {
      history = chatRecord.history as any[];
    } else {
      chatRecord = await (prisma as any).whatsAppChat.create({
        data: { phone: senderPhone, history: [] }
      });
    }

    // 3. Prepare Gemini Prompt
    const currentDate = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });
    const systemInstruction = `Eres el asistente digital de "El buen comer", ubicado en la Calle 6 # 39A-06 Entrada Barrio Rockefeller, Buenaventura.
La fecha y hora actual es: ${currentDate}. Estás atendiendo un cliente por WhatsApp. No uses saludos largos. No le digas tu nombre al cliente, solo di que eres el asistente del restaurante.

INVENTARIO ACTUAL Y PRECIOS:
${menuText}

PRECIOS DE DOMICILIO POR BARRIO:
- Rockefeller, Modelo, Maeugenia, Bellavista, Loma del Tamarindo, Juan 23, Porvenir, Eucaristico, 14 Julio: $3.000
- Cristal, Oriente, Transformadora, Galeón, Miraflores, Masamorra, San Luis, Kennedy, El 5: $4.000
- Marina, R9, Laureles, Inmaculada, Ciudadela 1 y 2: $5.000
- Ciudadela 3 y 4, Pino, 12 Abril, Independencia, Bolivar, Grancolombia, Santa Cruz, Todo Isla: $6.000
- Éxito, Triunfo, Nueva Grana, Brisas Del Mar: $7.000
- Colinas C.: $8.000

CAPACIDAD POR TAMAÑO:
- Personal: Para 1 persona.
- Duo: Para 2 o 3 personas.
- Familiar: Para 4 o 5 personas.
- Super familiar: Para 6 o 7 personas.

REGLAS DE OPERACIÓN:
- Tus respuestas deben ser EXAGERADAMENTE CORTAS y directas. No uses saludos largos ni formalismos. Ve directo al grano.
- SOLO puedes ofrecer lo que está en el menú. Si piden algo que no está, diles amablemente que no lo tienes.
- Cuando el cliente te indique qué quiere pedir, SIEMPRE pregúntale: el tamaño (si hay varios) y la cantidad. No asumas.
- Tu objetivo es completar un pedido. Asegúrate de pedirle su BARRIO (para el costo de envío). En Buenaventura la gente suele dar solo el barrio como ubicación, así que NO le pidas ni le exijas una dirección exacta; con el barrio y/o alguna referencia es más que suficiente. Pregúntale cómo va a pagar (Efectivo o Transferencia).
- Si el cliente elige pagar con Transferencia, coméntale los medios de pago: Nequi al 3173941189, y para otros bancos a la llave @nequilui57354. Pídele que envíe una foto o captura del comprobante por este medio. Confirmarás el pago cuando envíen la foto.
- Si recibes una imagen de un comprobante de pago, USA TU VISIÓN para analizarla. Verifica estrictamente: (1) Que la fecha corresponda a HOY (${currentDate}). (2) Que el valor coincida EXACTAMENTE con el total del pedido. (3) Que el destinatario sea Nequi 3173941189 o la llave @nequilui57354. Si hay algún error (fecha vieja, monto incorrecto, otro destinatario), informa amablemente el problema; si todo es correcto, aprueba el pago verbalmente.
- SIEMPRE informa al cliente el costo del domicilio según su barrio antes de cerrar el pedido.
- Si te dice su nombre para la orden, úsalo, sino omítelo.
- IMPORTANTE: Una vez que el cliente haya elegido sus productos, su tamaño, cantidad, y te haya dicho su barrio o ubicación, es momento de confirmar el pedido y cerrarlo en el sistema.
- 🚨 OMITIDO: Si el cliente pide ver el menú, la carta o dice hola por primera vez, usa el intent "send_menu".

FORMATO DE SALIDA (ESTRICTO JSON):
TU RESPUESTA SIEMPRE DEBE SER UN SÓLO OBJETO JSON VÁLIDO. NO ESCRIBAS TEXTO FUERA DEL JSON.
ESTRUCTURA:
{
  "intent": "chat" | "order" | "send_menu",
  "replyText": "Tu respuesta amable y exageradamente corta para el cliente",
  "orderData": {    // SÓLO REQUERIDA si intent es "order", de lo contrario no la envíes
    "customerName": "Nombre del cliente o null",
    "customerAddress": "Dirección completa (incluyendo barrio)",
    "deliveryFee": 3000, // Número exacto del costo de envío según barrio
    "notes": "Notas del pago, ej: EFECTIVO o TRANSFERENCIA",
    "items": [
      {
        "productName": "Nombre exacto del producto según menú",
        "sizeName": "Nombre exacto del tamaño según menú",
        "quantity": 1
      }
    ]
  }
}

Usa intent "chat" mientras conversas y tomas la orden. Usa intent "order" ÚNICAMENTE cuando la orden esté completa (el cliente ya eligió productos, tamaños, cantidades, dio su dirección y aceptó el total con domicilio). Cuando uses "order", despídete cordialmente en replyText informando que su pedido va en camino y el total a pagar (productos + domicilio).`;

    // 4. Build chat context and run Gemini
    const chatSession = model.startChat({
      systemInstruction: {
        role: "system",
        parts: [{ text: systemInstruction }]
      },
      generationConfig: {
        responseMimeType: "application/json"
      },
      history: history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      }))
    });

    const messageParts: any[] = [];
    if (messageText) messageParts.push({ text: messageText });
    if (!messageText && base64Image) messageParts.push({ text: "El usuario ha enviado una imagen del comprobante de transferencia." });
    
    if (base64Image) {
      messageParts.push({
        inlineData: {
          mimeType: mimeType,
          data: base64Image
        }
      });
    }

    const result = await chatSession.sendMessage(messageParts);
    const responseText = result.response.text();
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
      return NextResponse.json({ received: true, error: "invalid_format" });
    }

    // 5. Save History
    const historyUserText = messageText + (base64Image ? " [Imagen de comprobante adjunta]" : "");
    const newHistory = [
      ...history,
      { role: "user", text: historyUserText },
      { role: "model", text: JSON.stringify(geminiResponse) }
    ].slice(-10); // keep last 10 messages

    await (prisma as any).whatsAppChat.update({
      where: { phone: senderPhone },
      data: { history: newHistory }
    });

    // 6. Send Response to User via WhatsApp
    if (geminiResponse.intent === "send_menu") {
       const apiUrl = process.env.EVOLUTION_API_URL;
       const apiKey = process.env.EVOLUTION_API_KEY;
       const instanceName = process.env.EVOLUTION_INSTANCE_NAME;
       if (apiUrl && apiKey && instanceName) {
          try {
             await fetch(`${apiUrl}/message/sendMedia/${instanceName}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "apikey": apiKey },
                body: JSON.stringify({
                   number: remoteJid,
                   mediatype: "image",
                   media: "https://i.postimg.cc/yxk0bz65/Whats-App-Image-2026-04-24-at-3-05-45-PM.jpg",
                   caption: geminiResponse.replyText,
                   delay: 500,
                   presence: "composing"
                })
             });
          } catch(e) { console.error("[WhatsApp] Error sending menu media", e); }
       } else {
          await sendWhatsAppMessage(remoteJid, geminiResponse.replyText);
       }
    } else {
       await sendWhatsAppMessage(remoteJid, geminiResponse.replyText);
    }

    // 7. If intent is order, create the Prisma order and deduct inventory
    if (geminiResponse.intent === "order" && geminiResponse.orderData && geminiResponse.orderData.items.length > 0) {
      const systemUser = await prisma.user.findFirst({ where: { role: "ADMIN" } }) || await prisma.user.findFirst({ where: { role: "CASHIER" } });
      if (!systemUser) {
        console.error("[WhatsApp] No ADMIN or CASHIER user found to assign order");
        return NextResponse.json({ received: true, error: "no_system_user" });
      }

      console.log(`[WhatsApp Bot] Creating order for ${senderPhone}...`);

      const orderData = geminiResponse.orderData;
      const deliveryFee = Number(orderData.deliveryFee) || 0;
      let orderTotal = deliveryFee;

      // Match items strictly with DB to get IDs and prices
      const validItems: { productId: number; sizeName: string; quantity: number; price: number }[] = [];
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
            price: price
          });
        }
      }

      if (validItems.length > 0) {
        const order = await prisma.$transaction(async (tx) => {
          const newOrder = await tx.order.create({
            data: {
              userId: systemUser.id,
              customerName: orderData.customerName || pushName || `WA: ${senderPhone}`,
              customerPhone: senderPhone,
              customerAddress: orderData.customerAddress || null,
              notes: orderData.notes || null,
              source: "DELIVERY",
              status: "PENDING",
              total: orderTotal,
              deliveryFee: deliveryFee,
              items: {
                create: validItems.map(vi => ({
                  productId: vi.productId,
                  sizeName: vi.sizeName,
                  quantity: vi.quantity,
                  price: vi.price,
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

        // Clear chat history after successful order so they can start fresh next time
        await (prisma as any).whatsAppChat.update({
          where: { phone: senderPhone },
          data: { history: [] }
        });

        console.log(`[WhatsApp Bot] Order #${order.id} generated completely.`);
      } else {
        console.error("[WhatsApp Bot] Failed to match any items from the JSON payload:", orderData.items);
      }
    }

    return NextResponse.json({ received: true, status: "processed" });

  } catch (error: any) {
    console.error("[WhatsApp Webhook] General Error:", error);
    return NextResponse.json({ received: true, error: error.message });
  }
}
