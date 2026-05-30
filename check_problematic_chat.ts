import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const chat = await prisma.whatsAppChat.findUnique({
    where: { phone: '573165500484' }
  });

  if (chat) {
    console.log(`--- Chat: ${chat.phone} ---`);
    const history = chat.history as any[];
    history.forEach(h => {
      console.log(`[${h.role}]: ${h.text}`);
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
