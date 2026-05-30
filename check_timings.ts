import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const messages = await (prisma as any).whatsAppMessageBuffer.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  console.log('--- Last 10 Buffer items ---');
  messages.forEach((m: any) => {
    console.log(`[${m.createdAt}] ${m.phone}: ${m.content}`);
  });

  const chat = await prisma.whatsAppChat.findUnique({
    where: { phone: '573165500484' }
  });

  if (chat) {
    console.log('\n--- Maria Isabel Stats ---');
    console.log(`isProcessing: ${chat.isProcessing}`);
    console.log(`updatedAt: ${chat.updatedAt}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
