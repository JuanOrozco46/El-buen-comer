import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const orders = await prisma.order.findMany({
    where: {
      createdAt: {
        gte: startOfDay
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`Orders found today: ${orders.length}`);
  orders.forEach(o => {
    console.log(`[${o.createdAt.toISOString()}] ID: ${o.id}, Customer: ${o.customerName}, Status: ${o.status}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
