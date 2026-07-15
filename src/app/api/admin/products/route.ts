import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const products = await prisma.product.findMany({
      include: {
        sizes: true,
        recipes: {
          include: {
            ingredient: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json(products);
  } catch (error) {
    console.error('GET Admin Products Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, category, sizes, recipes } = body;

    // Use transaction to ensure product and dependencies are created together
    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          name,
          description,
          category,
          isActive: true
        }
      });

      // Create Sizes
      if (sizes && sizes.length > 0) {
        await tx.productSize.createMany({
          data: sizes.map((s: any) => ({
            productId: p.id,
            name: s.name,
            price: Number(s.price),
            isSoldOut: s.isSoldOut !== undefined ? !!s.isSoldOut : false
          }))
        });
      }

      // Create Recipes
      if (recipes && recipes.length > 0) {
        await tx.recipe.createMany({
          data: recipes.map((r: any) => ({
            productId: p.id,
            ingredientId: Number(r.ingredientId),
            sizeName: r.sizeName,
            quantity: Number(r.quantity)
          }))
        });
      }

      return p;
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error('POST Admin Product Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id, name, description, category, sizes, recipes, isActive, isSoldOut } = body;

    const product = await prisma.$transaction(async (tx) => {
      // Update Product base info
      await tx.product.update({
        where: { id: Number(id) },
        data: {
          name,
          description,
          category,
          isActive,
          isSoldOut
        }
      });

      // For simplicity in updates, sync sizes and recipes by recreating them
      // In a high-traffic app we'd be more granular, but for this Admin UI it's safe
      await tx.productSize.deleteMany({ where: { productId: Number(id) } });
      await tx.recipe.deleteMany({ where: { productId: Number(id) } });

      if (sizes && sizes.length > 0) {
        await tx.productSize.createMany({
          data: sizes.map((s: any) => ({
            productId: Number(id),
            name: s.name,
            price: Number(s.price),
            isSoldOut: s.isSoldOut !== undefined ? !!s.isSoldOut : false
          }))
        });
      }

      if (recipes && recipes.length > 0) {
        await tx.recipe.createMany({
          data: recipes.map((r: any) => ({
            productId: Number(id),
            ingredientId: Number(r.ingredientId),
            sizeName: r.sizeName,
            quantity: Number(r.quantity)
          }))
        });
      }

      return { id };
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error('PUT Admin Product Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id, isActive, isSoldOut, sizeId, sizeIsSoldOut } = body;

    // Direct toggle size status
    if (sizeId !== undefined) {
      const updatedSize = await prisma.productSize.update({
        where: { id: Number(sizeId) },
        data: { isSoldOut: !!sizeIsSoldOut }
      });
      return NextResponse.json(updatedSize);
    }

    const updateData: any = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (isSoldOut !== undefined) updateData.isSoldOut = isSoldOut;

    const product = await prisma.product.update({
      where: { id: Number(id) },
      data: updateData
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error('PATCH Admin Product Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
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

    await prisma.product.delete({
      where: { id: Number(id) }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE Admin Product Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
