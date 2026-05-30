import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const chat = await prisma.whatsAppChat.findUnique({
    where: { phone: '573127412714' }
  });

  if (chat) {
    console.log(`--- Chat: ${chat.phone} ---`);
    console.log(`Updated at: ${chat.updatedAt}`);
    const history = chat.history as any[];
    history.forEach((h, index) => {
      console.log(`[${index}] [${h.role}]: ${h.text}`);
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
