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

    // Calculate today start in Colombia time (UTC-5)
    const today = new Date();
    today.setUTCHours(today.getUTCHours() - 5);
    today.setUTCHours(0, 0, 0, 0);
    today.setUTCHours(today.getUTCHours() + 5);

    const where: any = {
      status: "PAID",
      createdAt: { gte: today }
    };

    if (isWaiter) {
      where.userId = currentUserId;
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        user: true,
        items: {
          include: {
            product: { select: { category: true } }
          }
        }
      },
    });

    const summaryMap: Record<number, {
      id: number;
      name: string;
      total: number;
      deliveryFees: number;
      totalPlatos: number;
      totalBebidas: number;
    }> = {};

    orders.forEach((order: any) => {
      const uId = order.userId;
      if (!summaryMap[uId]) {
        summaryMap[uId] = {
          id: uId,
          name: order.user?.name || "Usuario Desconocido",
          total: 0,
          deliveryFees: 0,
          totalPlatos: 0,
          totalBebidas: 0,
        };
      }
      summaryMap[uId].total += Number(order.total);
      summaryMap[uId].deliveryFees += Number(order.deliveryFee || 0);

      for (const item of order.items) {
        const itemTotal = Number(item.price) * Number(item.quantity);
        if (item.product?.category === "Bebidas") {
          summaryMap[uId].totalBebidas += itemTotal;
        } else {
          summaryMap[uId].totalPlatos += itemTotal;
        }
      }
    });

    const byUser = Object.values(summaryMap);
    const grandTotal = byUser.reduce((acc, u) => acc + u.total, 0);
    const grandTotalPlatos = byUser.reduce((acc, u) => acc + u.totalPlatos, 0);
    const grandTotalBebidas = byUser.reduce((acc, u) => acc + u.totalBebidas, 0);
    const grandDeliveryFees = byUser.reduce((acc, u) => acc + u.deliveryFees, 0);

    return NextResponse.json({ byUser, grandTotal, grandTotalPlatos, grandTotalBebidas, grandDeliveryFees });
  } catch (error) {
    console.error("Sales Summary Error:", error);
    return NextResponse.json({ error: "Failed to fetch sales summary" }, { status: 500 });
  }
}
