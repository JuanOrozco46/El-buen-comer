import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { startOfDay, endOfDay, subDays, startOfWeek, startOfMonth } from "date-fns";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");
    const userId = searchParams.get("userId");
    const limit = Number(searchParams.get("limit")) || 50;
    const range = searchParams.get("range");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const isNotAdmin = session.user.role !== 'ADMIN';
    const currentUserId = Number(session.user.id);

    const where: any = {};
    
    // For non-admins: always filter by their userId UNLESS they are viewing active POS orders
    if (isNotAdmin && statusFilter !== "active") {
      where.userId = currentUserId;
    } else if (userId) {
      where.userId = Number(userId);
    }
    
    if (statusFilter === "active") {
      where.status = { notIn: ["PAID", "CANCELLED"] };
    } else if (statusFilter) {
      where.status = statusFilter;
    }

    let start: Date | undefined;
    let end: Date | undefined;

    if (range && range !== "undefined") {
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
          start = from && from !== "undefined" ? startOfDay(new Date(from)) : startOfDay(now);
          end = to && to !== "undefined" ? endOfDay(new Date(to)) : endOfDay(now);
          break;
        default: // "today"
          start = startOfDay(now);
          end = endOfDay(now);
          break;
      }
    } else if ((from && from !== "undefined") || (to && to !== "undefined")) {
      if (from && from !== "undefined") {
        start = new Date(from);
      }
      if (to && to !== "undefined") {
        const toDate = new Date(to);
        toDate.setUTCHours(23, 59, 59, 999);
        end = toDate;
      }
    }

    if (start || end) {
      where.createdAt = {};
      if (start) where.createdAt.gte = start;
      if (end) where.createdAt.lte = end;
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
      take: statusFilter === "active" ? undefined : (from || to ? 5000 : limit)
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
    const { customerName, customerPhone, customerAddress, notes, source, status, total, deliveryFee, items, tableId } = body;
    const userId = session.user.id;

    // Use transaction for order creation and inventory deduction
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId: Number(userId),
          tableId: tableId ? Number(tableId) : null,
          customerName: customerName || null,
          customerPhone: customerPhone || null,
          customerAddress: customerAddress || null,
          notes: notes || null,
          source: (source as any) || "POS",
          status: (status as any) || "PENDING",
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
        } as any,
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
