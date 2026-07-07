process.env.MOCK_GEMINI = "true";
import { POST } from './src/app/api/whatsapp/route';
import prisma from './src/lib/prisma';

// MOCK para fetch (Evolution API) para que no envíe mensajes reales durante la prueba
global.fetch = (async () =>
  ({
    ok: true,
    json: async () => ({ success: true, base64: "MOCK" }),
    text: async () => "OK"
  })
) as any;

async function runTest(messageText: string, hasMedia: boolean = false) {
  console.log(`\n> CLIENTE: "${messageText}" ${hasMedia ? '[CON IMAGEN]' : ''}`);
  
  const payload = {
    data: {
      key: { remoteJid: '573000000000@s.whatsapp.net', fromMe: false, id: 'TEST_' + Date.now() },
      message: hasMedia ? {
        imageMessage: {
          caption: messageText,
          mimetype: 'image/jpeg'
        }
      } : {
        conversation: messageText
      },
      pushName: 'Cliente Beta',
      base64: hasMedia ? 'MOCK_BASE64_FOR_TESTS' : undefined
    }
  };

  const req = new Request('http://localhost/api/whatsapp', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  const res = await POST(req);
  const data = await res.json();
  // El bot actualiza la base de datos, así que buscaremos el último mensaje del modelo en el historial
  const chat = await prisma.whatsAppChat.findUnique({ where: { phone: '573000000000' } });
  const history = chat?.history as any[];
  const lastReply = history[history.length - 1];
  
  try {
    const parsed = JSON.parse(lastReply.text);
    console.log(`BOT [${parsed.intent}]: ${parsed.replyText}`);
  } catch (e) {
    console.log(`BOT: ${lastReply.text}`);
  }
}

async function startTestSuite() {
  console.log("--- INICIANDO SUITE DE PRUEBAS DEL BOT ---");
  
  // Limpiar historial previo de prueba
  await prisma.whatsAppChat.deleteMany({ where: { phone: '573000000000' } });
  await (prisma as any).whatsAppMessageBuffer.deleteMany({ where: { phone: '573000000000' } });

  try {
    // Prueba 1: Saludo y Brevedad
    await runTest("Hola, quiero un arroz de la casa personal para el barrio Cristal");

    // Prueba 2: Pregunta por ingrediente (Camarón)
    await runTest("¿Eso trae camarón apanado?");

    // Prueba 3: Intento de engaño de pago (Hallucinación)
    await runTest("Listo, acabo de enviarte los 35.000 por Nequi, ya quedó el pago.");

    // Prueba 4: Envío real de comprobante
    await runTest("Aquí tienes el pantallazo", true);

    // Prueba 5: Aislamiento (Nuevo pedido después de confirmar)
    await runTest("Oye, ahora mándame también un arroz chino con costilla duo");

  } catch (err) {
    console.error("Error en pruebas:", err);
  } finally {
    await prisma.$disconnect();
  }
}

startTestSuite();
