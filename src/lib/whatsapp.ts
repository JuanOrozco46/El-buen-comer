/**
 * WhatsApp Utility — Evolution API Integration
 * 
 * This module provides helper functions to interact with the Evolution API
 * for sending and receiving WhatsApp messages.
 * 
 * To activate:
 *  1. Set EVOLUTION_API_URL in your .env
 *  2. Set EVOLUTION_API_KEY in your .env
 *  3. Set EVOLUTION_INSTANCE_NAME in your .env
 *  4. Point your Evolution API webhook to: POST /api/whatsapp
 */

/**
 * Normalizes a Colombian phone number.
 * Strips non-digits, auto-adds "57" prefix if needed.
 */
export function normalizarNumero(num: string | undefined | null): string {
  if (!num) return "";
  if (num.includes("@")) return num; // Already a JID, leave it

  const clean = num.replace(/\D/g, "");

  // Auto-add Colombia code if 10 digits
  if (clean.length === 10 && !clean.startsWith("57")) {
    return "57" + clean;
  }

  return clean;
}

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME;

/**
 * Sends a text message to a WhatsApp number via the Evolution API.
 * @param to - Phone number in international format (e.g., "573001234567")
 * @param message - The text message to send
 */
export async function sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE_NAME) {
    console.warn("[WhatsApp] Missing API credentials. Message not sent.");
    return false;
  }

  try {
    const response = await fetch(
      `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE_NAME}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          number: to,
          text: message,
          delay: 500,
          presence: "composing",
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[WhatsApp] API error:", response.status, errorBody);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[WhatsApp] Network error:", error);
    return false;
  }
}

/**
 * Formats a standard order confirmation message.
 * @param orderId - The order ID
 * @param items - Array of order items with product names and quantities
 * @param total - Total amount
 */
export function formatOrderConfirmation(
  orderId: number,
  items: { productName: string; quantity: number; sizeName: string }[],
  total: number
): string {
  const itemsList = items
    .map((i) => `  • ${i.quantity}x ${i.productName} (${i.sizeName})`)
    .join("\n");

  return (
    `✅ *Pedido #${orderId} Confirmado*\n\n` +
    `*Tus platos:*\n${itemsList}\n\n` +
    `*Total: $${total.toLocaleString("es-CO")}*\n\n` +
    `_Tu pedido está siendo preparado. ¡Gracias por tu compra!_ 🍽️`
  );
}

/**
 * Formats the menu message to send to new customers.
 * @param products - Array of products with names, categories, and sizes
 */
export function formatMenuMessage(
  products: { name: string; category: string; sizes: { name: string; price: number }[] }[]
): string {
  const categories = [...new Set(products.map((p) => p.category))];

  const sections = categories.map((cat) => {
    const items = products.filter((p) => p.category === cat);
    const itemLines = items.map((p) => {
      const prices = p.sizes.map((s) => `${s.name}: $${s.price.toLocaleString("es-CO")}`).join(" | ");
      return `  • ${p.name}\n    ${prices}`;
    });
    return `*${cat.toUpperCase()}*\n${itemLines.join("\n")}`;
  });

  return (
    `🔥 *Menú El buen comer*\n\n` +
    sections.join("\n\n") +
    `\n\n_Para pedir, escribe el nombre del plato y el tamaño._\n_Ej: "Arroz con Pollo Personal"_`
  );
}
