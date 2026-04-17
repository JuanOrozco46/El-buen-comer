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
    const { active } = body;

    const updated = await prisma.globalSettings.upsert({
      where: { id: 1 },
      update: { isPanicModeActive: active },
      create: { id: 1, isPanicModeActive: active }
    });

    return NextResponse.json({ isPanicModeActive: updated.isPanicModeActive });
  } catch (error) {
    return NextResponse.json({ error: "Failed to toggle panic mode" }, { status: 500 });
  }
}

export async function GET() {
  const settings = await prisma.globalSettings.findUnique({ where: { id: 1 } });
  return NextResponse.json({ isPanicModeActive: settings?.isPanicModeActive || false });
}
