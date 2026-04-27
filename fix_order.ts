import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const orderId = 540086;
  // Set to 11:55 PM on April 25 UTC
  // Bogota is UTC-5, so 11:55 PM UTC is 6:55 PM Bogota.
  // Actually, let's set it to today 7:00 PM local time? 
  // Let's just use a safe ISO string.
  const newDate = new Date('2026-04-25T23:00:00Z'); 
  
  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: {
      createdAt: newDate,
      updatedAt: newDate
    }
  });

  console.log('Order updated:', JSON.stringify(updatedOrder, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
