import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { active, pickupOnly } = body;

    const data: any = {};
    if (active !== undefined) data.isPanicModeActive = active;
    if (pickupOnly !== undefined) data.isPickupOnlyActive = pickupOnly;

    const updated = await prisma.globalSettings.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data }
    }) as any;

    return NextResponse.json({ 
      isPanicModeActive: updated.isPanicModeActive,
      isPickupOnlyActive: updated.isPickupOnlyActive
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}

export async function GET() {
  const settings = await prisma.globalSettings.findUnique({ where: { id: 1 } }) as any;
  return NextResponse.json({ 
    isPanicModeActive: settings?.isPanicModeActive || false,
    isPickupOnlyActive: settings?.isPickupOnlyActive || false
  });
}
