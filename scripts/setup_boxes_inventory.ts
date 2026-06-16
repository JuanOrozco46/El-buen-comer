
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("Setting up boxes in inventory...");

  const boxes = [
    { name: "Caja Personal", unit: "und" },
    { name: "Caja Duo", unit: "und" },
    { name: "Caja Familiar", unit: "und" },
    { name: "Caja Super Familiar", unit: "und" }
  ];

  const ingredientIds: Record<string, number> = {};

  for (const box of boxes) {
    let ingredient = await prisma.ingredient.findFirst({
      where: { name: box.name }
    });

    if (!ingredient) {
      ingredient = await prisma.ingredient.create({
        data: {
          name: box.name,
          unit: box.unit,
          stock: 1000, // Initial stock
          minStock: 50
        }
      });
      console.log(`Created ingredient: ${box.name}`);
    } else {
      console.log(`Ingredient already exists: ${box.name}`);
    }
    ingredientIds[box.name] = ingredient.id;
  }

  // Mapping size names to box names
  const sizeToBoxMap: Record<string, string> = {
    "Personal": "Caja Personal",
    "Duo": "Caja Duo",
    "Familiar": "Caja Familiar",
    "Super Fam.": "Caja Super Familiar",
    "Super familiar": "Caja Super Familiar"
  };

  // Find all products in categories that use boxes (Arroces)
  const products = await prisma.product.findMany({
    where: {
      category: "Arroces"
    },
    include: {
      sizes: true
    }
  });

  console.log(`Found ${products.length} rice products to link with boxes.`);

  for (const product of products) {
    for (const size of product.sizes) {
      const boxName = sizeToBoxMap[size.name];
      if (boxName && ingredientIds[boxName]) {
        const ingredientId = ingredientIds[boxName];

        // Create or update recipe
        await prisma.recipe.upsert({
          where: {
            productId_ingredientId_sizeName: {
              productId: product.id,
              ingredientId: ingredientId,
              sizeName: size.name
            }
          },
          update: {
            quantity: 1
          },
          create: {
            productId: product.id,
            ingredientId: ingredientId,
            sizeName: size.name,
            quantity: 1
          }
        });
        console.log(`Linked ${product.name} (${size.name}) -> ${boxName}`);
      }
    }
  }

  console.log("✅ Boxes inventory setup complete!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
