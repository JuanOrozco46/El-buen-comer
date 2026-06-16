import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const orderId = Number(id);
    if (isNaN(orderId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: { include: { sizes: true } } } },
        table: true,
        user: true,
        payments: true
      }
    });

    if (!order) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

    return NextResponse.json(order);
  } catch (error) {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const orderId = Number(id);
    if (isNaN(orderId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const body = await req.json();
    const { status, paymentMethod, splitPayments, items, total, tableId } = body;

    // Use a transaction to ensure atomic updates
    const updatedOrder = await prisma.$transaction(async (tx) => {
      // 1. Check if order exists
      const existingOrder = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true }
      });
      if (!existingOrder) throw new Error("Orden no encontrada");

      // 2. Handle Item Updates if provided (Editing Mode)
      if (items && Array.isArray(items)) {
        // --- RESTORE STOCK FOR OLD ITEMS ---
        for (const oldItem of existingOrder.items) {
          const recipes = await tx.recipe.findMany({
            where: { productId: oldItem.productId, sizeName: oldItem.sizeName }
          });
          for (const recipe of recipes) {
            await tx.ingredient.update({
              where: { id: recipe.ingredientId },
              data: { stock: { increment: Number(recipe.quantity) * Number(oldItem.quantity) } }
            });
          }
        }

        // Delete existing items for this order
        await tx.orderItem.deleteMany({
          where: { orderId }
        });

        // Create new items
        await tx.orderItem.createMany({
          data: items.map((item: any) => ({
            orderId,
            productId: Number(item.productId || item.product.id),
            sizeName: item.sizeName || item.size?.name || "Personal",
            quantity: Number(item.quantity),
            price: Number(item.price || item.size?.price),
            notes: item.notes || null
          }))
        });

        // --- DEDUCT STOCK FOR NEW ITEMS ---
        for (const newItem of items) {
          const productId = Number(newItem.productId || newItem.product.id);
          const sizeName = newItem.sizeName || newItem.size?.name || "Personal";
          const quantity = Number(newItem.quantity);

          const recipes = await tx.recipe.findMany({
            where: { productId, sizeName }
          });
          for (const recipe of recipes) {
            await tx.ingredient.update({
              where: { id: recipe.ingredientId },
              data: { stock: { decrement: Number(recipe.quantity) * quantity } }
            });
            await tx.inventoryLog.create({
              data: {
                ingredientId: recipe.ingredientId,
                amount: Number(recipe.quantity) * quantity,
                type: 'OUT',
                reason: `Edición Orden #${orderId}`
              }
            });
          }
        }
      }

      // 3. Update order fields
      const order = await tx.order.update({
        where: { id: orderId },
        data: {
          status: status || existingOrder.status,
          total: total !== undefined ? Number(total) : existingOrder.total,
          tableId: tableId !== undefined ? (tableId === null ? null : Number(tableId)) : existingOrder.tableId,
          updatedAt: new Date(),
        },
      });

      // 4. Handle payments if status is PAID
      if (status === "PAID") {
        // Delete previous payments if any (re-payment)
        await tx.payment.deleteMany({ where: { orderId } });

        if (splitPayments && Array.isArray(splitPayments)) {
          await tx.payment.createMany({
            data: splitPayments.map((p: any) => ({
              orderId,
              amount: Number(p.amount),
              method: p.method
            }))
          });
        } else if (paymentMethod) {
          await tx.payment.create({
            data: {
              orderId,
              amount: Number(total || existingOrder.total),
              method: paymentMethod
            }
          });
        }
      }

      return tx.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { product: { include: { sizes: true } } } }, payments: true, table: true }
      });
    });

    return NextResponse.json(updatedOrder);
  } catch (error: any) {
    console.error("PUT Order Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "No tienes permiso para eliminar órdenes." }, { status: 403 });
    }

    const { id } = await params;
    const orderId = Number(id);
    if (isNaN(orderId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    // Transaction for deletion and stock restoration
    await prisma.$transaction(async (tx) => {
      const existingOrder = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true }
      });
      if (!existingOrder) return;

      // Restore stock
      for (const item of existingOrder.items) {
        const recipes = await tx.recipe.findMany({
          where: { productId: item.productId, sizeName: item.sizeName }
        });
        for (const recipe of recipes) {
          await tx.ingredient.update({
            where: { id: recipe.ingredientId },
            data: { stock: { increment: Number(recipe.quantity) * Number(item.quantity) } }
          });
          await tx.inventoryLog.create({
            data: {
              ingredientId: recipe.ingredientId,
              amount: Number(recipe.quantity) * Number(item.quantity),
              type: 'IN',
              reason: `Cancelación Orden #${orderId}`
            }
          });
        }
      }

      await tx.payment.deleteMany({ where: { orderId } });
      await tx.orderItem.deleteMany({ where: { orderId } });
      await tx.order.delete({ where: { id: orderId } });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE Order Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
