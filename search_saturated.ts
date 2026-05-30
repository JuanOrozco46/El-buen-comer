import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const chats = await prisma.whatsAppChat.findMany();

  for (const chat of chats) {
    const history = chat.history as any[];
    if (history) {
      const match = history.find(h => 
        h.role === 'model' && 
        (h.text.toLowerCase().includes('saturado') || h.text.toLowerCase().includes('no podemos tomar'))
      );
      if (match) {
        console.log(`--- Chat: ${chat.phone} ---`);
        console.log(`Found message: ${match.text}`);
        console.log(`Last update: ${chat.updatedAt}`);
        console.log('\n');
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
