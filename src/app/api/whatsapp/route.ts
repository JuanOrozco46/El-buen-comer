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

/**
 * POST /api/whatsapp
 * 
 * Webhook receiver for incoming WhatsApp messages from Evolution API.
 * 
 * Flow:
 *  1. Receive message from Evolution API
 *  2. Parse sender and message text
 *  3. If "menu" → respond with menu
 *  4. If a product name is matched → create an order and confirm
 *  5. Otherwise → send help message
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Evolution API sends events in this shape
    const event = body.event;

    // Handle connection updates (just log them)
    if (event === "connection.update") {
      const state = body.data?.state || "unknown";
      console.log(`[WhatsApp] Connection update: ${state}`);
      return NextResponse.json({ received: true, connectionState: state });
    }

    if (event !== "messages.upsert") {
      return NextResponse.json({ received: true });
    }

    const messageData = body.data?.messages?.[0] || body.data; // Handle both array and object
    if (!messageData || messageData.key?.fromMe) {
      // Ignore outgoing messages
      return NextResponse.json({ received: true });
    }

    const remoteJid = messageData.key?.remoteJid;
    const rawPhone = remoteJid?.replace(/@s.whatsapp.net|@g.us/, "");
    const senderPhone = normalizarNumero(rawPhone);
    const pushName = messageData.pushName || "";

    // Extract message text from various possible fields in v2.x
    const messageText = messageData.message?.conversation ||
      messageData.message?.extendedTextMessage?.text ||
      messageData.message?.imageMessage?.caption ||
      messageData.message?.videoMessage?.caption || "";

    if (!remoteJid || !messageText) {
      return NextResponse.json({ received: true });
    }

    const normalizedText = messageText.toLowerCase().trim();
    console.log(`[WhatsApp] Message from ${pushName} (${senderPhone}): "${messageText}"`);

    // --- Command: "menu" or "hola" ---
    if (normalizedText.includes("menu") || normalizedText.includes("menú") || normalizedText.includes("hola")) {
      const products = await prisma.product.findMany({
        where: { isActive: true, isSoldOut: false },
        include: { sizes: true },
      });

      const menuMsg = formatMenuMessage(
        products.map((p) => ({
          name: p.name,
          category: p.category,
          sizes: p.sizes.map((s) => ({ name: s.name, price: Number(s.price) })),
        }))
      );

      await sendWhatsAppMessage(remoteJid, menuMsg);
      return NextResponse.json({ received: true, action: "sent_menu" });
    }

    // --- Try to match a product in message ---
    // ... (logic remains same)
    const products = await prisma.product.findMany({
      where: { isActive: true, isSoldOut: false },
      include: { sizes: true },
    });

    let matchedProduct = null;
    let matchedSize = null;

    for (const product of products) {
      if (normalizedText.includes(product.name.toLowerCase())) {
        matchedProduct = product;
        for (const size of product.sizes) {
          if (normalizedText.includes(size.name.toLowerCase())) {
            matchedSize = size;
            break;
          }
        }
        // Default to first size if no size mentioned
        if (!matchedSize) matchedSize = product.sizes[0];
        break;
      }
    }

    if (!matchedProduct || !matchedSize) {
      // Didn't understand
      await sendWhatsAppMessage(
        remoteJid,
        `Hola ${pushName}! 👋 No entendí tu pedido. Escribe *"menu"* para ver nuestra carta completa.\n\n` +
        `_Si deseas pedir, escribe el nombre del plato y el tamaño._\n_Ej: "Arroz con Pollo Personal"_`
      );
      return NextResponse.json({ received: true, action: "sent_help" });
    }

    // Create the order in the system
    // We first need a system user to associate the order with, or allow guest orders
    const systemUser = await prisma.user.findFirst({ where: { role: "CASHIER" } });
    if (!systemUser) {
      await sendWhatsAppMessage(remoteJid, "En este momento no podemos procesar tu pedido. Por favor llámanos al local.");
      return NextResponse.json({ received: true, action: "no_cashier_user" });
    }

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId: systemUser.id,
          customerName: pushName || `WA: ${senderPhone}`,
          customerPhone: senderPhone,
          source: "WHATSAPP",
          status: "PENDING",
          total: Number(matchedSize!.price),
          items: {
            create: [{
              productId: matchedProduct!.id,
              sizeName: matchedSize!.name,
              quantity: 1,
              price: matchedSize!.price,
            }],
          },
        },
        include: { items: { include: { product: true } } },
      });

      // Automated Stock Deduction
      const recipes = await tx.recipe.findMany({
        where: {
          productId: matchedProduct!.id,
          sizeName: matchedSize!.name
        }
      });

      for (const recipe of recipes) {
        const deduction = Number(recipe.quantity) * 1; // quantity is always 1 for WA single item orders currently

        await tx.ingredient.update({
          where: { id: recipe.ingredientId },
          data: {
            stock: { decrement: deduction }
          }
        });

        await tx.inventoryLog.create({
          data: {
            ingredientId: recipe.ingredientId,
            amount: deduction,
            type: 'OUT',
            reason: `WhatsApp Orden #${newOrder.id}`
          }
        });
      }

      return newOrder;
    });

    const confirmMsg = formatOrderConfirmation(
      order.id,
      order.items.map((i: any) => ({

        productName: i.product.name,
        quantity: i.quantity,
        sizeName: i.sizeName,
      })),
      Number(order.total)
    );

    await sendWhatsAppMessage(remoteJid, confirmMsg);
    return NextResponse.json({ received: true, action: "order_created", orderId: order.id });

  } catch (error: any) {
    console.error("[WhatsApp Webhook] Error:", error);
    // Always return 200 to prevent Evolution API from retrying
    return NextResponse.json({ received: true, error: error.message });
  }
}
