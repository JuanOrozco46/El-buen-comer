import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const chat = await prisma.whatsAppChat.findUnique({
    where: { phone: '573173941189' } // Admin number usually
  });

  if (!chat) {
    const chats = await prisma.whatsAppChat.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 5
    });
    chats.forEach(c => console.log(`Phone: ${c.phone}, Last: ${c.updatedAt}`));
    return;
  }

  console.log(`--- Chat: ${chat.phone} ---`);
  const history = chat.history as any[];
  history.slice(-10).forEach(h => {
    console.log(`[${h.role}]: ${h.text}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
