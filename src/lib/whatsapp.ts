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
const EVOLUTION_INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME || "Arroceria";

let lastReconnectAttempt = 0;
const RECONNECT_COOLDOWN_MS = 45000; // 45s cooldown between auto-reconnect attempts

/**
 * Checks if the Evolution API WhatsApp instance is connected ("open").
 * If it is closed or disconnected, automatically requests a restart/reconnect
 * using the stored session credentials (without logging out or requiring a new QR).
 */
export async function ensureWhatsAppConnected(
  forceReconnect: boolean = false
): Promise<{ connected: boolean; state: string; reconnected?: boolean }> {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE_NAME) {
    return { connected: false, state: "NOT_CONFIGURED" };
  }

  const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");
  const headers = {
    "Content-Type": "application/json",
    apikey: EVOLUTION_API_KEY,
  };

  let currentState = "unknown";

  try {
    const stateRes = await fetch(
      `${baseUrl}/instance/connectionState/${EVOLUTION_INSTANCE_NAME}`,
      { headers: { apikey: EVOLUTION_API_KEY }, cache: "no-store" }
    );
    if (stateRes.ok) {
      const data = await stateRes.json().catch(() => ({}));
      currentState = data?.instance?.state || data?.state || "unknown";
    }
  } catch (err: any) {
    console.error("[WhatsApp KeepAlive] Error checking connectionState:", err.message);
  }

  if (currentState === "open" && !forceReconnect) {
    return { connected: true, state: "open", reconnected: false };
  }

  const now = Date.now();
  if (now - lastReconnectAttempt < RECONNECT_COOLDOWN_MS) {
    return { connected: currentState === "open", state: currentState, reconnected: false };
  }
  lastReconnectAttempt = now;

  console.warn(
    `[WhatsApp Auto-Reconnect] Instance "${EVOLUTION_INSTANCE_NAME}" state is "${currentState}". Attempting automatic reconnect...`
  );

  let reconnected = false;

  // 1. Try restarting the instance socket (PUT / POST)
  for (const method of ["PUT", "POST"]) {
    try {
      const restartRes = await fetch(
        `${baseUrl}/instance/restart/${EVOLUTION_INSTANCE_NAME}`,
        { method, headers }
      );
      if (restartRes.ok) {
        reconnected = true;
        break;
      }
    } catch {
      // Ignore and try connect endpoint next
    }
  }

  // 2. Also call /instance/connect to ensure Baileys socket wakes up
  try {
    const connectRes = await fetch(
      `${baseUrl}/instance/connect/${EVOLUTION_INSTANCE_NAME}`,
      { method: "GET", headers: { apikey: EVOLUTION_API_KEY }, cache: "no-store" }
    );
    if (connectRes.ok) {
      reconnected = true;
    }
  } catch (err: any) {
    console.error("[WhatsApp Auto-Reconnect] Connect call error:", err.message);
  }

  return { connected: false, state: currentState, reconnected };
}

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

  const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`[WhatsApp] Sending message to ${to} (attempt ${attempt}): "${message.substring(0, 50)}..."`);
      const response = await fetch(
        `${baseUrl}/message/sendText/${EVOLUTION_INSTANCE_NAME}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            number: to,
            options: {
              delay: Math.floor(Math.random() * 800) + 400, // 400-1200ms
              presence: "composing",
            },
            text: message,
          }),
        }
      );

      if (response.ok) {
        console.log(`[WhatsApp] Message sent successfully to ${to}`);
        return true;
      }

      const errorBody = await response.text();
      console.error(`[WhatsApp] API error (attempt ${attempt}):`, response.status, errorBody);

      if (attempt === 1) {
        await ensureWhatsAppConnected(true);
        await new Promise((r) => setTimeout(r, 2500));
      }
    } catch (error) {
      console.error(`[WhatsApp] Network error (attempt ${attempt}):`, error);
      if (attempt === 1) {
        await ensureWhatsAppConnected(true);
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
  }

  return false;
}

/**
 * Sends a "composing" (typing) presence indicator to a WhatsApp number.
 * This makes the bot show "escribiendo..." before sending the actual message.
 * @param to - Phone number or JID
 * @param durationMs - How long (ms) to show typing before it auto-clears (default 3000)
 */
export async function sendTypingIndicator(to: string, durationMs: number = 3000): Promise<boolean> {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE_NAME) return false;

  try {
    const cleanUrl = EVOLUTION_API_URL.endsWith('/') ? EVOLUTION_API_URL.slice(0, -1) : EVOLUTION_API_URL;
    const response = await fetch(
      `${cleanUrl}/chat/sendPresence/${EVOLUTION_INSTANCE_NAME}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          number: to,
          delay: durationMs,
          presence: "composing",
        }),
      }
    );

    if (!response.ok) {
      console.error("[WhatsApp] Presence API error:", response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[WhatsApp] Presence error:", error);
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
  total: number,
  estimatedTime: string = "entre 30 y 45 minutos"
): string {
  const itemsList = items
    .map((i) => `  • ${i.quantity}x ${i.productName} (${i.sizeName})`)
    .join("\n");

  return (
    `✅ *Pedido #${orderId} Confirmado*\n\n` +
    `*Tus platos:*\n${itemsList}\n\n` +
    `*Total: $${total.toLocaleString("es-CO")}*\n\n` +
    `_El tiempo estimado para entrega o recoger es ${estimatedTime}. ¡Gracias por tu compra!_ 🍽️`
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
/**
 * Sends a media message (image) to a WhatsApp number via the Evolution API.
 * @param to - Phone number or JID
 * @param mediaUrl - Optional URL of the image. If not provided, it uses process.env.MENU.
 * @param caption - Optional caption
 */
export async function sendWhatsAppMedia(to: string, mediaUrl?: string, caption?: string): Promise<boolean> {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE_NAME) {
    console.warn("[WhatsApp] Missing API credentials for media. Message not sent.");
    return false;
  }

  const finalUrl = mediaUrl || process.env.MENU;

  if (!finalUrl) {
    console.error("[WhatsApp] No MENU URL found in env or parameters.");
    return false;
  }

  const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`[WhatsApp] Sending media to ${to} (attempt ${attempt}): ${finalUrl}`);
      const response = await fetch(
        `${baseUrl}/message/sendMedia/${EVOLUTION_INSTANCE_NAME}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            number: to,
            mediatype: "image",
            mimetype: "image/jpeg",
            caption: caption || "",
            media: finalUrl,
            options: {
              delay: 500,
              presence: "composing",
            }
          }),
        }
      );

      if (response.ok) {
        console.log(`[WhatsApp] Media sent successfully to ${to}`);
        return true;
      }

      const errorBody = await response.text();
      console.error(`[WhatsApp] Media API error (attempt ${attempt}):`, response.status, errorBody);

      if (attempt === 1) {
        await ensureWhatsAppConnected(true);
        await new Promise((r) => setTimeout(r, 2500));
      }
    } catch (error) {
      console.error(`[WhatsApp] Media network error (attempt ${attempt}):`, error);
      if (attempt === 1) {
        await ensureWhatsAppConnected(true);
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
  }

  return false;
}
