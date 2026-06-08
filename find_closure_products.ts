import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { description: { contains: 'via' } },
        { description: { contains: 'vía' } },
        { description: { contains: 'cierre' } }
      ]
    }
  });
  console.log('Matching Products:', JSON.stringify(products, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
