import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME || "Arroceria";

/**
 * GET /api/admin/whatsapp
 * Read instance connection status without changing Evolution's socket.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["ADMIN", "CASHIER", "WAITER"].includes(session.user.role || "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE_NAME) {
      return NextResponse.json({
        configured: false,
        status: "NOT_CONFIGURED",
        message: "Variables de entorno de Evolution API no configuradas (.env)",
      });
    }

    const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");

    // Try to fetch instance info/status
    const endpoints = [
      `${baseUrl}/instance/connectionState/${EVOLUTION_INSTANCE_NAME}`,
      `${baseUrl}/instance/fetchInstances?instanceName=${EVOLUTION_INSTANCE_NAME}`,
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          headers: { apikey: EVOLUTION_API_KEY },
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          // Normalize response
          const state = data?.instance?.state || data?.state || data?.[0]?.instance?.state || "unknown";

          return NextResponse.json({
            configured: true,
            status: state === "open" ? "CONNECTED" : "DISCONNECTED",
            instanceName: EVOLUTION_INSTANCE_NAME,
            raw: data,
          });
        }
      } catch {
        continue;
      }
    }

    return NextResponse.json({
      configured: true,
      status: "DISCONNECTED",
      instanceName: EVOLUTION_INSTANCE_NAME,
      message: "No se pudo verificar el estado de la instancia.",
    });
  } catch (error: any) {
    console.error("[WhatsApp Admin] GET Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/whatsapp
 * Initialize instance and auto-configure webhook.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE_NAME) {
      return NextResponse.json(
        { error: "Variables de entorno de Evolution API no configuradas." },
        { status: 400 }
      );
    }

    const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");
    const headers = {
      "Content-Type": "application/json",
      apikey: EVOLUTION_API_KEY,
    };

    console.log("[WhatsApp Admin] Initializing instance:", EVOLUTION_INSTANCE_NAME);
    console.log("[WhatsApp Admin] Base URL:", baseUrl);

    // 1. Create instance (or skip if already exists)
    const createEndpoints = [
      `${baseUrl}/instance/create`,
      `${baseUrl}/v2/instance/create`,
    ];

    let created = false;
    for (const ep of createEndpoints) {
      try {
        console.log("[WhatsApp Admin] Trying create at:", ep);
        const res = await fetch(ep, {
          method: "POST",
          headers,
          body: JSON.stringify({
            instanceName: EVOLUTION_INSTANCE_NAME,
            token: EVOLUTION_API_KEY,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS",
          }),
        });

        const data = await res.json().catch(() => ({}));
        console.log(`[WhatsApp Admin] Create at ${ep} returned status: ${res.status}`, data);

        if (res.ok || res.status === 403 || JSON.stringify(data).includes("already exists")) {
          created = true;
          break;
        }
      } catch (err: any) {
        console.error(`[WhatsApp Admin] Create error at ${ep}:`, err.message);
        continue;
      }
    }

    if (!created) {
      console.error("[WhatsApp Admin] Failed to create instance after trying all endpoints.");
      return NextResponse.json(
        { error: "No se pudo crear la instancia de Evolution." },
        { status: 500 }
      );
    }

    // 2. Auto-configure webhook
    const body = await req.json().catch(() => ({}));
    const appUrl = body.appUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const webhookUrl = `${appUrl}/api/whatsapp`;
    console.log("[WhatsApp Admin] Configuring webhook URL:", webhookUrl);

    const webhookEndpoints = [
      `${baseUrl}/webhook/instance/set`,
      `${baseUrl}/webhook/set/${EVOLUTION_INSTANCE_NAME}`,
    ];

    let webhookSet = false;
    for (const ep of webhookEndpoints) {
      try {
        const res = await fetch(ep, {
          method: "POST",
          headers,
          body: JSON.stringify({
            webhook: {
              enabled: true,
              url: webhookUrl,
              webhookByEvents: false,
              events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
            },
          }),
        });
        if (res.ok) {
          webhookSet = true;
          break;
        }
      } catch {
        continue;
      }
    }

    return NextResponse.json({
      success: true,
      instanceCreated: created,
      webhookConfigured: webhookSet,
      webhookUrl,
      message: webhookSet
        ? "Instancia inicializada y webhook configurado correctamente."
        : "Instancia creada pero no se pudo configurar el webhook automáticamente.",
    });
  } catch (error: any) {
    console.error("[WhatsApp Admin] POST Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
