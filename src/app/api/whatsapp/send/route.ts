import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { sendWhatsAppMessage } from "../../../../lib/whatsapp";

/**
 * POST /api/whatsapp/send
 * 
 * Sends a WhatsApp message to a phone number.
 * Protected — only ADMIN and CASHIER can call this directly.
 * 
 * Body: { to: "573001234567", message: "Your message here" }
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CASHIER")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { to, message } = await req.json();

    if (!to || !message) {
      return NextResponse.json(
        { error: "Se requiere 'to' (número) y 'message'." },
        { status: 400 }
      );
    }

    const success = await sendWhatsAppMessage(to, message);

    if (success) {
      return NextResponse.json({ success: true, to, message });
    } else {
      return NextResponse.json(
        { error: "No se pudo enviar el mensaje. Verifica las credenciales de la API de WhatsApp en el .env." },
        { status: 503 }
      );
    }
  } catch (error: any) {
    console.error("POST /api/whatsapp/send Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
