import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const userId = 90001; // Jose Luis Suarez
  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log("Recent orders for Jose Luis:", orders.map(o => ({
    id: o.id,
    createdAt: o.createdAt,
    total: o.total,
    status: o.status
  })));

  // Try parsing date similarly
  const from = "2026-07-17";
  const to = "2026-07-17";
  const where: any = { userId };
  where.createdAt = {};
  where.createdAt.gte = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);
  where.createdAt.lte = toDate;

  console.log("Where clause:", where);
  const filtered = await prisma.order.findMany({
    where,
    take: 5
  });
  console.log("Filtered count today:", filtered.length);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
