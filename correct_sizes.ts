import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const products = [
    {
      id: 30007,
      name: 'Arroz con Camarones',
      sizes: [
        { name: 'Duo', price: 48000 },
        { name: 'Familiar', price: 73000 },
        { name: 'Super Fam.', price: 86000 }
      ],
      personalRecipe: [ { ingredientId: 30008, quantity: 150 } ] // Camarón
    },
    {
      id: 30008,
      name: 'Arroz Mixto',
      sizes: [
        { name: 'Duo', price: 41000 },
        { name: 'Familiar', price: 59000 },
        { name: 'Super Fam.', price: 68000 }
      ],
      personalRecipe: [ 
        { ingredientId: 1, quantity: 100 }, // Pollo
        { ingredientId: 30008, quantity: 100 } // Camarón
      ]
    },
    {
      id: 30009,
      name: 'Arroz Thai',
      sizes: [
        { name: 'Duo', price: 39000 },
        { name: 'Familiar', price: 60000 },
        { name: 'Super Fam.', price: 72000 }
      ],
      personalRecipe: [
        { ingredientId: 1, quantity: 50 }, // Pollo
        { ingredientId: 30001, quantity: 50 }, // Cerdo
        { ingredientId: 30008, quantity: 50 } // Camarón
      ]
    }
  ];

  const boxMap: Record<string, number> = {
    'Duo': 90002, // Caja Duo
    'Familiar': 90003, // Caja Familiar
    'Super Fam.': 90004 // Caja Super Familiar
  };

  for (const p of products) {
    console.log(`Restoring product: ${p.name}`);

    // 1. Create Sizes
    for (const s of p.sizes) {
      await prisma.productSize.create({
        data: {
          productId: p.id,
          name: s.name,
          price: s.price
        }
      });

      // 2. Create Food Recipes (multiplied by factor: Duo=2, Familiar=3, SuperFam=4)
      const factor = s.name === 'Duo' ? 2 : (s.name === 'Familiar' ? 3 : 4);
      for (const r of p.personalRecipe) {
        await prisma.recipe.create({
          data: {
            productId: p.id,
            ingredientId: r.ingredientId,
            sizeName: s.name,
            quantity: r.quantity * factor
          }
        });
      }

      // 3. Create Box Recipe (1 unit)
      const boxId = boxMap[s.name];
      if (boxId) {
        await prisma.recipe.create({
          data: {
            productId: p.id,
            ingredientId: boxId,
            sizeName: s.name,
            quantity: 1
          }
        });
      }
    }

    // 4. Delete Personal Size and its Recipes
    const deletedPersonalSize = await prisma.productSize.deleteMany({
      where: { productId: p.id, name: 'Personal' }
    });
    const deletedPersonalRecipes = await prisma.recipe.deleteMany({
      where: { productId: p.id, sizeName: 'Personal' }
    });
    console.log(`Deleted Personal size for ${p.name}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
