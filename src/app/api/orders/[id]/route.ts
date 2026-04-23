import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";

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
    const { id } = await params;
    const orderId = Number(id);
    if (isNaN(orderId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    // We cancel the order by deleting it (or marking it as CANCELLED)
    // For now, the user asked to "borrar", so we delete it from DB or items first.
    await prisma.$transaction([
      prisma.payment.deleteMany({ where: { orderId } }),
      prisma.orderItem.deleteMany({ where: { orderId } }),
      prisma.order.delete({ where: { id: orderId } })
    ]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE Order Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
