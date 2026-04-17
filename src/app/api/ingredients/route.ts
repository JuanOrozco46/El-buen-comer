import { NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ingredients = await prisma.ingredient.findMany({
      orderBy: { name: 'asc' }
    });

    return NextResponse.json(ingredients);
  } catch (error) {
    console.error('GET Ingredients Error:', error);
    return NextResponse.json({ error: 'Failed to fetch ingredients' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, unit, stock, minStock } = body;

    const ingredient = await prisma.ingredient.create({
      data: {
        name,
        unit,
        stock: Number(stock),
        minStock: Number(minStock)
      }
    });

    return NextResponse.json(ingredient);
  } catch (error) {
    console.error('POST Ingredient Error:', error);
    return NextResponse.json({ error: 'Failed to create ingredient' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id, name, unit, stock, minStock } = body;

    const ingredient = await prisma.ingredient.update({
      where: { id: Number(id) },
      data: {
        name,
        unit,
        stock: Number(stock),
        minStock: Number(minStock)
      }
    });

    return NextResponse.json(ingredient);
  } catch (error) {
    console.error('PUT Ingredient Error:', error);
    return NextResponse.json({ error: 'Failed to update ingredient' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    await prisma.ingredient.delete({
      where: { id: Number(id) }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE Ingredient Error:', error);
    return NextResponse.json({ error: 'Failed to delete ingredient' }, { status: 500 });
  }
}
