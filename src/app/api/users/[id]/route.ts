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

    await prisma.user.delete({ where: { id: userId } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
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
