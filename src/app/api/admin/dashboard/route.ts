import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { startOfDay, endOfDay, subDays, startOfWeek, startOfMonth } from "date-fns";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "today";
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    let start: Date;
    let end: Date;

    const now = new Date();

    switch (range) {
      case "yesterday":
        start = startOfDay(subDays(now, 1));
        end = endOfDay(subDays(now, 1));
        break;
      case "week":
        start = startOfWeek(now, { weekStartsOn: 1 });
        end = endOfDay(now);
        break;
      case "month":
        start = startOfMonth(now);
        end = endOfDay(now);
        break;
      case "custom":
        start = fromParam ? startOfDay(new Date(fromParam)) : startOfDay(now);
        end = toParam ? endOfDay(new Date(toParam)) : endOfDay(now);
        break;
      default: // "today"
        start = startOfDay(now);
        end = endOfDay(now);
        break;
    }

    // 1. Total Revenue (PAID orders in range)
    const revenueData = await prisma.order.aggregate({
      where: {
        status: 'PAID',
        createdAt: { gte: start, lte: end }
      },
      _sum: { total: true },
      _count: { id: true }
    });

    // 2. Pending Orders Count (active, not date-filtered)
    const pendingCount = await prisma.order.count({
      where: { status: { notIn: ['PAID', 'CANCELLED'] } }
    });

    // 3. Expenses in range
    const expensesData = await prisma.expense.aggregate({
      where: {
        createdAt: { gte: start, lte: end }
      },
      _sum: { amount: true }
    });

    // 4. Payment breakdown by method
    const paymentBreakdown = await prisma.payment.groupBy({
      by: ['method'],
      where: {
        createdAt: { gte: start, lte: end }
      },
      _sum: { amount: true },
      _count: { id: true }
    });

    const paymentsByMethod = paymentBreakdown.map(p => ({
      method: p.method,
      total: Number(p._sum.amount || 0),
      count: p._count.id
    }));

    // 5. Top Products (By Quantity in range)
    const topProductsRaw = await prisma.orderItem.groupBy({
      by: ['productId'],
      _sum: { quantity: true },
      where: {
        order: {
          status: 'PAID',
          createdAt: { gte: start, lte: end }
        }
      },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5
    });

    const topProducts = await Promise.all(topProductsRaw.map(async (item) => {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: { name: true }
      });
      return {
        name: product?.name || "Unknown",
        value: Number(item._sum.quantity || 0)
      };
    }));

    // 6. Waiter Performance in range
    const waiterDataRaw = await prisma.order.groupBy({
      by: ['userId'],
      _count: { id: true },
      where: {
        createdAt: { gte: start, lte: end }
      }
    });

    const waiterPerformance = await Promise.all(waiterDataRaw.map(async (item) => {
      const user = await prisma.user.findUnique({
        where: { id: item.userId },
        select: { name: true }
      });
      return {
        name: user?.name || "User",
        orders: item._count.id
      };
    }));

    // 7. Global Settings
    const settings = await prisma.globalSettings.findUnique({
      where: { id: 1 }
    });

    return NextResponse.json({
      revenue: Number(revenueData._sum.total || 0),
      totalOrders: revenueData._count.id || 0,
      pendingOrders: pendingCount,
      expenses: Number(expensesData._sum.amount || 0),
      paymentsByMethod,
      topProducts,
      waiterPerformance,
      isPanicModeActive: settings?.isPanicModeActive || false
    });

  } catch (error) {
    console.error("Dashboard API Error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
