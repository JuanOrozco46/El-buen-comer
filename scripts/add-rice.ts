import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rice = await prisma.product.create({
    data: {
      name: 'Arroz de la casa',
      category: 'Arroces',
      description: 'Arroz de la casa, preparacion especial',
      isActive: true,
      sizes: {
        create: [
          { name: 'Duo', price: 60000 },
          { name: 'Familiar', price: 80000 },
          { name: 'Super familiar', price: 110000 },
        ]
      }
    }
  });

  console.log("Added Arroz de la casa!", rice);
}

main().catch(console.error).finally(() => prisma.$disconnect());
