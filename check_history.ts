import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const chats = await prisma.whatsAppChat.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 5
  });

  chats.forEach(chat => {
    console.log(`--- Chat: ${chat.phone} (Updated: ${chat.updatedAt}) ---`);
    const history = chat.history as any[];
    if (history) {
      history.slice(-5).forEach(h => {
        console.log(`[${h.role}]: ${h.text.substring(0, 200)}...`);
      });
    }
    console.log('\n');
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
