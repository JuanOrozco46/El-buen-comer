
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const sizes = await prisma.productSize.findMany({
    select: { name: true },
    distinct: ['name']
  });
  console.log('Existing sizes:', sizes.map(s => s.name));
}

main().catch(console.error).finally(() => prisma.$disconnect());
