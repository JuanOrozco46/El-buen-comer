import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { startOfDay, endOfDay, subDays, startOfWeek, startOfMonth } from "date-fns";
export const dynamic = 'force-dynamic';


export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'CASHIER')) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "today";
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const isNotAdmin = session.user.role !== 'ADMIN';
    const userId = Number(session.user.id);

    let start: Date;
    let end: Date;

    // Forced Bogota Timezone for correct "Today" calculation
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));

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

    // Common where clause for role-based privacy
    const privacyFilter = isNotAdmin ? { userId: userId } : {};

    // 1. Total Revenue (PAID orders in range)
    const revenueData = await prisma.order.aggregate({
      where: {
        status: 'PAID',
        createdAt: { gte: start, lte: end },
        ...privacyFilter
      },
      _sum: { total: true },
      _count: { id: true }
    });

    // 2. Pending Orders Count (active, not date-filtered)
    // For pending orders, we might want to show all for POS, 
    // but the user said "records of their sales". 
    // In the dashboard, let's filter pending too to match the "their records" rule.
    const pendingCount = await prisma.order.count({
      where: { 
        status: { notIn: ['PAID', 'CANCELLED'] },
        ...privacyFilter
      }
    });

    // 3. Expenses in range (Only Admin should see all expenses, or filter by user?)
    // Usually expenses are global or by user who registered it. 
    // Let's filter expenses too for cashier dashboard.
    const expensesData = await prisma.expense.aggregate({
      where: {
        createdAt: { gte: start, lte: end },
        ...privacyFilter
      },
      _sum: { amount: true }
    });

    // 4. Payment breakdown by method
    const paymentBreakdown = await prisma.payment.groupBy({
      by: ['method'],
      where: {
        createdAt: { gte: start, lte: end },
        order: privacyFilter // prisma allows filtering related records if needed, but let's be safe
      },
      _sum: { amount: true },
      _count: { id: true }
    });

    // Wait, the Payment table doesn't have userId directly. 
    // We need to filter payments by order.userId
    const filteredPayments = await prisma.payment.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        order: privacyFilter
      }
    });
    
    // Group them manually if needed or use nested groupBy if prisma supports it well
    // Let's use a simpler approach: get payment methods from filtered orders
    const paymentsByMethod = ['CASH', 'TRANSFER', 'CARD', 'MIXED'].map(method => {
      const perMethod = filteredPayments.filter(p => p.method === method);
      return {
        method,
        total: perMethod.reduce((acc, p) => acc + Number(p.amount), 0),
        count: perMethod.length
      };
    }).filter(p => p.count > 0);

    // 5. Top Products (By Quantity in range)
    const topProductsRaw = await prisma.orderItem.groupBy({
      by: ['productId'],
      _sum: { quantity: true },
      where: {
        order: {
          status: 'PAID',
          createdAt: { gte: start, lte: end },
          ...privacyFilter
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

    // 6. Waiter Performance in range (ADMIN sees all, CASHIER sees only self)
    const waiterDataRaw = await prisma.order.groupBy({
      by: ['userId'],
      _count: { id: true },
      _sum: { total: true },
      where: {
        createdAt: { gte: start, lte: end },
        ...privacyFilter
      }
    });

    const waiterPerformance = await Promise.all(waiterDataRaw.map(async (item) => {
      const user = await prisma.user.findUnique({
        where: { id: item.userId },
        select: { name: true }
      });
      return {
        id: item.userId,
        name: user?.name || "User",
        orders: item._count.id,
        revenue: Number(item._sum.total || 0)
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
