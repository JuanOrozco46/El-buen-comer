import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = session.user.role;
    const isWaiter = role === "WAITER";
    const currentUserId = Number(session.user.id);

    // Calculate today's start in Colombia time (UTC-5)
    const today = new Date();
    today.setUTCHours(today.getUTCHours() - 5);
    today.setUTCHours(0, 0, 0, 0);
    today.setUTCHours(today.getUTCHours() + 5);

    const where: any = {
      status: "PAID",
      createdAt: { gte: today }
    };

    // For waiters: always filter by their userId. 
    // Cashiers and Admins can see the summary of all creators for today.
    if (isWaiter) {
      where.userId = currentUserId;
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        user: true,
      },
    });

    // Group by cashier
    const summaryMap: Record<number, { id: number, name: string, total: number, deliveryFees: number }> = {};

    orders.forEach((order: any) => {
      const uId = order.userId;
      if (!summaryMap[uId]) {
        summaryMap[uId] = { 
          id: uId, 
          name: order.user?.name || "Usuario Desconocido", 
          total: 0,
          deliveryFees: 0
        };
      }
      summaryMap[uId].total += Number(order.total);
      summaryMap[uId].deliveryFees += Number(order.deliveryFee || 0);
    });

    return NextResponse.json(Object.values(summaryMap));
  } catch (error) {
    console.error("Sales Summary Error:", error);
    return NextResponse.json({ error: "Failed to fetch sales summary" }, { status: 500 });
  }
}
