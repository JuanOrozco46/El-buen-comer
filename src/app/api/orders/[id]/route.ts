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
        items: { include: { product: true } },
        table: true,
        user: true
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
    const { status, paymentMethod, splitPayments } = body;

    // Use a transaction to ensure status and payment records are atomic
    const updatedOrder = await prisma.$transaction(async (tx) => {
      // 1. Check if order exists
      const existingOrder = await tx.order.findUnique({
        where: { id: orderId }
      });
      if (!existingOrder) throw new Error("Orden no encontrada");

      // 2. Update order status
      const order = await tx.order.update({
        where: { id: orderId },
        data: {
          status: status || existingOrder.status,
          updatedAt: new Date(),
        },
        include: { items: true, payments: true }
      });

      // 3. Handle payments if status is PAID
      if (status === "PAID") {
        if (splitPayments && Array.isArray(splitPayments)) {
          // Mixed/Split payments
          await tx.payment.createMany({
            data: splitPayments.map((p: any) => ({
              orderId,
              amount: Number(p.amount),
              method: p.method // CASH, CARD, TRANSFER
            }))
          });
        } else if (paymentMethod) {
          // Single payment
          await tx.payment.create({
            data: {
              orderId,
              amount: existingOrder.total,
              method: paymentMethod // CASH, CARD, TRANSFER
            }
          });
        }
      }

      return tx.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { product: true } }, payments: true }
      });
    });

    return NextResponse.json(updatedOrder);
  } catch (error: any) {
    console.error("PUT Order Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
