import { NextResponse } from "next/server";
import prisma from "../../../../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../lib/auth";

export async function GET() {
  try {
    const settings = await (prisma.globalSettings as any).findUnique({
      where: { id: 1 },
      include: { activeWaiter: { select: { name: true, id: true } } }
    });

    return NextResponse.json({
      activeWaiterId: settings?.activeWaiterId || null,
      activeWaiterName: settings?.activeWaiter?.name || null
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch active waiter" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'WAITER' && session.user.role !== 'CASHIER')) {
      return NextResponse.json({ error: "Unauthorized. Only waiters can claim this role." }, { status: 401 });
    }

    const userId = Number(session.user.id);

    const updated = await (prisma.globalSettings as any).upsert({
      where: { id: 1 },
      update: { activeWaiterId: userId },
      create: { id: 1, activeWaiterId: userId, isPanicModeActive: false }
    });

    return NextResponse.json({ 
      success: true, 
      activeWaiterId: updated.activeWaiterId 
    });
  } catch (error) {
    console.error("[Active Waiter API] Error:", error);
    return NextResponse.json({ error: "Failed to claim active waiter role" }, { status: 500 });
  }
}
