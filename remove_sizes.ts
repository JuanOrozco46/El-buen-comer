import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const productsToUpdate = [
    { name: 'Arroz con Camarones', id: 30007 },
    { name: 'Arroz Mixto', id: 30008 }
  ];

  for (const p of productsToUpdate) {
    console.log(`Updating product: ${p.name} (ID: ${p.id})`);
    
    // Delete all sizes for this product that are NOT "Personal"
    const deletedSizes = await prisma.productSize.deleteMany({
      where: {
        productId: p.id,
        name: { not: 'Personal' }
      }
    });
    
    console.log(`Deleted ${deletedSizes.count} non-personal sizes for ${p.name}`);

    // Clean up recipes for these non-personal sizes
    const deletedRecipes = await prisma.recipe.deleteMany({
      where: {
        productId: p.id,
        sizeName: { not: 'Personal' }
      }
    });
    console.log(`Deleted ${deletedRecipes.count} non-personal recipes for ${p.name}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
