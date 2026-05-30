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
    const historyText = JSON.stringify(chat.history);
    if (historyText.toLowerCase().includes('saturado')) {
      console.log(`Saturated chat today: ${chat.phone}`);
      // Find the first occurrence today
      const history = chat.history as any[];
      const saturatedMessage = history.find((h: any) => 
        h.role === 'model' && h.text.toLowerCase().includes('saturado')
      );
      if (saturatedMessage) {
        console.log(` -> Message: ${saturatedMessage.text}`);
      }
    }
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
