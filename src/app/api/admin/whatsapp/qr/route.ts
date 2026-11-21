import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../lib/auth";

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME || "Arroceria";

/**
 * GET /api/admin/whatsapp/qr
 * Get QR code for WhatsApp pairing.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE_NAME) {
      return NextResponse.json(
        { error: "Evolution API no configurada." },
        { status: 400 }
      );
    }

    const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");
    const headers = { apikey: EVOLUTION_API_KEY };

    // SAFETY CHECK: Never call /instance/connect if the instance is already "open".
    // In Evolution API v2.3.7, calling /instance/connect on an already open instance
    // spawns a duplicate Baileys socket in memory and causes a "conflict: replaced" loop.
    try {
      const stateRes = await fetch(
        `${baseUrl}/instance/connectionState/${EVOLUTION_INSTANCE_NAME}`,
        { headers, cache: "no-store" }
      );
      if (stateRes.ok) {
        const stateData = await stateRes.json().catch(() => ({}));
        const currentState = stateData?.instance?.state || stateData?.state;
        if (currentState === "open") {
          return NextResponse.json({
            qr: null,
            connected: true,
            message: "Ya estás conectado a WhatsApp.",
          });
        }

        // CRITICAL FIX for Evolution API v2.3.7:
        // If the instance is already in "connecting" state (e.g., auto-started on container boot
        // or from a previous QR click), calling /instance/connect again WITHOUT first closing
        // the existing "connecting" socket spawns a 2nd Baileys socket in memory. Once the QR
        // is scanned, both sockets connect and fight each other with "conflict: replaced".
        if (currentState === "connecting") {
          console.log("[WhatsApp QR] Closing existing 'connecting' socket before generating fresh QR...");
          await fetch(`${baseUrl}/instance/logout/${EVOLUTION_INSTANCE_NAME}`, {
            method: "DELETE",
            headers,
          }).catch(() => {});
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    } catch {
      // Proceed to QR endpoints if state check fails
    }

    const endpoints = [
      `${baseUrl}/instance/connect/${EVOLUTION_INSTANCE_NAME}`,
      `${baseUrl}/v2/instance/connect/${EVOLUTION_INSTANCE_NAME}`,
      `${baseUrl}/instance/qrcode/${EVOLUTION_INSTANCE_NAME}`, // Alternative endpoint
      `${baseUrl}/instance/connect?instanceName=${EVOLUTION_INSTANCE_NAME}`, // Fallback query param style
    ];

    console.log("[WhatsApp QR] Attempting to connect instance:", EVOLUTION_INSTANCE_NAME);

    for (const url of endpoints) {
      try {
        console.log("[WhatsApp QR] Trying endpoint:", url);
        // Some versions need GET, others need POST
        let res = await fetch(url, { headers });
        console.log(`[WhatsApp QR] ${url} returned status: ${res.status}`);

        if (res.status === 405 || res.status === 404) {
          // If 405 Method Not Allowed or 404 Not Found, try POST as a fallback
          console.log(`[WhatsApp QR] ${res.status === 404 ? "404 Not Found" : "405 Method Not Allowed"}. Retrying with POST...`);
          res = await fetch(url, { method: "POST", headers, body: "{}" });
          console.log(`[WhatsApp QR] POST ${url} returned status: ${res.status}`);
        }

        if (res.ok) {
          const data = await res.json();
          console.log("[WhatsApp QR] Successful response from Evolution API.");

          // Normalize QR from various Evolution API response shapes
          let base64 = null;
          if (data.qrcode?.base64) {
            base64 = data.qrcode.base64;
          } else if (data.base64) {
            base64 = data.base64;
          }

          // Ensure data URI prefix
          if (base64 && !base64.startsWith("data:")) {
            base64 = `data:image/png;base64,${base64}`;
          }

          if (base64) {
            return NextResponse.json({ qr: base64 });
          }

          // If connected, no QR needed
          if (data.instance?.state === "open" || data.state === "open") {
            return NextResponse.json({
              qr: null,
              connected: true,
              message: "Ya estás conectado a WhatsApp.",
            });
          }

          console.warn("[WhatsApp QR] Response OK but no QR found in data:", JSON.stringify(data));
          return NextResponse.json({ qr: null, raw: data });
        }
      } catch (err: any) {
        console.error("[WhatsApp QR] Fetch error for", url, ":", err.message);
        continue;
      }
    }

    console.error("[WhatsApp QR] All endpoints failed to return a QR code.");
    return NextResponse.json(
      { error: "No se pudo obtener el código QR de la Evolution API." },
      { status: 404 }
    );
  } catch (error: any) {
    console.error("[WhatsApp QR] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
