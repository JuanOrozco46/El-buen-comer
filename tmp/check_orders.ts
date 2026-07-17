import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const totalOrders = await prisma.order.count();
  console.log("Total orders in DB:", totalOrders);

  const waiters = await prisma.user.findMany({
    select: { id: true, name: true, role: true }
  });
  console.log("Waiters in DB:", waiters);

  const groups = await prisma.order.groupBy({
    by: ['userId'],
    _count: { id: true }
  });
  console.log("Grouped by userId:", groups);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
