import { NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';
import bcrypt from 'bcrypt';

export async function GET() {
  try {
    const user = await prisma.user.findUnique({
      where: { userName: 'admin' }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found in DB' });
    }

    const isValid = await bcrypt.compare('admin', user.hashedPassword);

    return NextResponse.json({
      user: { id: user.id, userName: user.userName, role: user.role },
      passwordValid: isValid,
      dbUrlExists: !!process.env.DATABASE_URL
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack, env: !!process.env.DATABASE_URL });
  }
}
