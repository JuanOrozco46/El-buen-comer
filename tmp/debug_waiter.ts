import { PrismaClient } from "@prisma/client";
import { startOfDay, endOfDay, startOfMonth, startOfWeek, subDays } from "date-fns";

const prisma = new PrismaClient();

async function main() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  
  const ranges: Record<string, [Date, Date]> = {
    today: [startOfDay(now), endOfDay(now)],
    yesterday: [startOfDay(subDays(now, 1)), endOfDay(subDays(now, 1))],
    week: [startOfWeek(now, { weekStartsOn: 1 }), endOfDay(now)],
    month: [startOfMonth(now), endOfDay(now)],
  };

  console.log("=== Bogota 'now':", now.toISOString(), "===\n");

  for (const [name, [start, end]] of Object.entries(ranges)) {
    // Dashboard groupBy (same query as dashboard API)
    const dashData = await prisma.order.groupBy({
      by: ['userId'],
      _count: { id: true },
      _sum: { total: true },
      where: { createdAt: { gte: start, lte: end } }
    });

    // Individual orders for Jose Luis (userId=90001), same as /api/orders would do
    const orders = await prisma.order.findMany({
      where: {
        userId: 90001,
        createdAt: { gte: start, lte: end }
      },
      take: 5,
      orderBy: { createdAt: 'desc' }
    });

    console.log(`--- Range: ${name} ---`);
    console.log(`  start: ${start.toISOString()}, end: ${end.toISOString()}`);
    console.log(`  Dashboard waiterPerformance:`, dashData.map(d => ({
      userId: d.userId,
      orders: d._count.id,
      total: Number(d._sum.total)
    })));
    console.log(`  /api/orders for Jose Luis (90001): ${orders.length} orders found`);
    if (orders.length > 0) {
      console.log(`    First order: id=${orders[0].id}, createdAt=${orders[0].createdAt.toISOString()}`);
    }
    console.log();
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
