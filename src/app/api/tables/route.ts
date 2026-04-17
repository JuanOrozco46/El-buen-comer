import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tables = await prisma.table.findMany({
      include: {
        orders: {
          where: {
            status: {
              notIn: ["PAID", "CANCELLED"]
            }
          },
          select: {
             id: true,
             status: true
          }
        }
      },
      orderBy: { number: "asc" }
    });

    return NextResponse.json(tables);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch tables" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { number } = await req.json();
    const table = await prisma.table.create({
      data: { number, status: "AVAILABLE" }
    });

    return NextResponse.json(table);
  } catch (error) {
    return NextResponse.json({ error: "Failed to create table" }, { status: 500 });
  }
}
