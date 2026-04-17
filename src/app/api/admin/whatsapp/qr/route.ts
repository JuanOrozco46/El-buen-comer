import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../lib/auth";

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME;

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

    const endpoints = [
      `${baseUrl}/instance/connect/${EVOLUTION_INSTANCE_NAME}`,
      `${baseUrl}/v2/instance/connect/${EVOLUTION_INSTANCE_NAME}`,
    ];

    for (const url of endpoints) {
      try {
        // Some versions need GET, others need POST
        let res = await fetch(url, { headers });
        if (res.status === 405) {
          res = await fetch(url, { method: "POST", headers, body: "{}" });
        }

        if (res.ok) {
          const data = await res.json();

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
          if (data.instance?.state === "open") {
            return NextResponse.json({
              qr: null,
              connected: true,
              message: "Ya estás conectado a WhatsApp.",
            });
          }

          return NextResponse.json({ qr: null, raw: data });
        }
      } catch {
        continue;
      }
    }

    return NextResponse.json(
      { error: "No se pudo obtener el código QR." },
      { status: 404 }
    );
  } catch (error: any) {
    console.error("[WhatsApp QR] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
