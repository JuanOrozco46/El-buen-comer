import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tomorrow = new Date('2026-04-26T00:00:00Z');
  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: tomorrow },
      user: { name: { contains: 'Tamara' } }
    },
    include: { user: true }
  });

  console.log('Orders found for April 26:', JSON.stringify(orders, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
