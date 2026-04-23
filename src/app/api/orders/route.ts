import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");
    const limit = Number(searchParams.get("limit")) || 50;

    const where: any = {};
    if (statusFilter === "active") {
      where.status = { notIn: ["PAID", "CANCELLED"] };
    } else if (statusFilter) {
      where.status = statusFilter;
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        items: {
          include: {
            product: { include: { sizes: true } }
          }
        },
        user: true,
        payments: true
      },
      orderBy: { createdAt: "desc" },
      take: statusFilter === "active" ? undefined : limit
    });

    return NextResponse.json(orders);
  } catch (error) {
    console.error("GET Orders Error:", error);
    return NextResponse.json({ error: "Failed validation" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { customerName, customerPhone, source, status, total, deliveryFee, items, tableId } = body;
    const userId = session.user.id;

    // Use transaction for order creation and inventory deduction
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId: Number(userId),
          tableId: tableId ? Number(tableId) : null,
          customerName: customerName || null,
          customerPhone: customerPhone || null,
          source: source || "POS",
          status: status || "PENDING",
          total: Number(total),
          deliveryFee: deliveryFee ? Number(deliveryFee) : null,
          items: {
            create: items.map((item: any) => ({
              productId: Number(item.productId),
              sizeName: item.sizeName || "Personal",
              quantity: Number(item.quantity),
              price: Number(item.price),
              notes: item.notes || null,
            })),
          },
          payments: (body.payments && body.payments.length > 0) ? {
            create: body.payments.map((p: any) => ({
              method: p.method,
              amount: Number(p.amount)
            }))
          } : undefined,
        },
        include: { items: true, payments: true }
      });

      // Automated Stock Deduction
      for (const item of items) {
        const recipes = await tx.recipe.findMany({
          where: {
            productId: Number(item.productId),
            sizeName: item.sizeName || "Personal"
          }
        });

        for (const recipe of recipes) {
          const deduction = Number(recipe.quantity) * Number(item.quantity);

          await tx.ingredient.update({
            where: { id: recipe.ingredientId },
            data: {
              stock: { decrement: deduction }
            }
          });

          await tx.inventoryLog.create({
            data: {
              ingredientId: recipe.ingredientId,
              amount: deduction,
              type: 'OUT',
              reason: `Venta Orden #${newOrder.id}`
            }
          });
        }
      }

      return newOrder;
    });

    return NextResponse.json(order);
  } catch (error: any) {
    console.error("POST Order Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
