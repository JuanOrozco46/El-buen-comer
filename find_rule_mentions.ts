import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const chats = await prisma.whatsAppChat.findMany({
    where: {
      updatedAt: {
        gte: startOfDay
      }
    }
  });

  chats.forEach((chat: any) => {
    const history = chat.history as any[];
    const match = history.find((h: any) => 
      h.role === 'model' && h.text.includes('6:30')
    );
    if (match) {
      console.log(`--- Chat: ${chat.phone} ---`);
      console.log(`Message: ${match.text}`);
    }
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
