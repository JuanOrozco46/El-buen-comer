import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const products = await prisma.product.findMany();
  console.log('Products:', JSON.stringify(products, null, 2));
  const settings = await (prisma as any).globalSettings.findFirst();
  console.log('Settings:', JSON.stringify(settings, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
