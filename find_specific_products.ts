import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: 'Mixto' } },
        { name: { contains: 'Camarones' } },
        { name: { contains: 'Camarón' } }
      ]
    },
    include: { sizes: true }
  });
  console.log(JSON.stringify(products, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
