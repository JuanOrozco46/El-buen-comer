import { NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { startOfDay, endOfDay, subDays } from "date-fns";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "30");
    const start = startOfDay(subDays(new Date(), days));
    const end = endOfDay(new Date());

    const expenses = await prisma.expense.findMany({
      where: {
        createdAt: { gte: start, lte: end }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return NextResponse.json(expenses.map(e => ({
      id: e.id,
      amount: Number(e.amount),
      description: e.description,
      category: e.category,
      createdAt: e.createdAt
    })));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: "Only ADMIN can register expenses" }, { status: 403 });
    }

    const { amount, description, category } = await req.json();

    const expense = await prisma.expense.create({
      data: {
        amount: Number(amount),
        description,
        category
      }
    });

    return NextResponse.json(expense);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
