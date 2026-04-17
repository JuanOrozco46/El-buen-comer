import { NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: {
        sizes: true
      }
    });

    const serializedProducts = products.map(p => ({
      ...p,
      sizes: p.sizes.map(s => ({
        ...s,
        price: Number(s.price)
      }))
    }));

    return NextResponse.json(serializedProducts);
  } catch (error) {
    console.error('API Products Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
