import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import bcrypt from 'bcrypt';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const userId = Number(id);
    if (isNaN(userId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const currentAdminId = Number(session.user.id);
    if (userId === currentAdminId) {
      return NextResponse.json({ error: "No puedes eliminar tu propio usuario administrador" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Clear activeWaiterId if this user is currently set as the active waiter
      await tx.globalSettings.updateMany({
        where: { activeWaiterId: userId },
        data: { activeWaiterId: null }
      });

      // 2. Reassign historical orders to an admin user so sales history is preserved
      const targetAdmin = !isNaN(currentAdminId)
        ? await tx.user.findUnique({ where: { id: currentAdminId } })
        : null;
      const fallbackUser = targetAdmin || await tx.user.findFirst({
        where: { id: { not: userId }, role: 'ADMIN' },
        orderBy: { id: 'asc' }
      }) || await tx.user.findFirst({
        where: { id: { not: userId } },
        orderBy: { id: 'asc' }
      });

      if (fallbackUser) {
        await tx.order.updateMany({
          where: { userId },
          data: { userId: fallbackUser.id }
        });
      }

      // 3. Delete the user
      await tx.user.delete({ where: { id: userId } });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE User Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const userId = Number(id);
    if (isNaN(userId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const { password } = await req.json();
    if (!password) return NextResponse.json({ error: "Password required" }, { status: 400 });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.update({
      where: { id: userId },
      data: { hashedPassword }
    });

    return NextResponse.json({ success: true, user: { id: user.id } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
