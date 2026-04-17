import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding products from the menu...");

  const menuItems = [
    {
      name: "Arroz Campesino",
      description: "Pollo, cerdo, chorizo, chicharrón, costilla, plátano, verduras y raíz",
      category: "Arroces",
      prices: {
        "Personal": 24000,
        "Duo": 40000,
        "Familiar": 60000,
        "Super Fam.": 68000
      }
    },
    {
      name: "Arroz Seis Carnes",
      description: "Pollo, chorizo, ranchera, camarón, cerdo, jamón, verduras y raíz",
      category: "Arroces",
      prices: {
        "Personal": 26000,
        "Duo": 37000,
        "Familiar": 58000,
        "Super Fam.": 70000
      }
    },
    {
      name: "Arroz Ranchero",
      description: "Pollo, chorizo, ranchera, jamón, verduras y raíz",
      category: "Arroces",
      prices: {
        "Personal": 24000,
        "Duo": 36000,
        "Familiar": 55000,
        "Super Fam.": 63000
      }
    },
    {
      name: "Arroz Chino",
      description: "Pollo, cerdo, camarón, jamón y raíz",
      category: "Arroces",
      prices: {
        "Personal": 23000,
        "Duo": 35000,
        "Familiar": 53000,
        "Super Fam.": 59000
      }
    },
    {
      name: "Arroz con Chuleta",
      description: "Camarón, jamón, raíz, chuleta y papas a la francesa",
      category: "Arroces",
      prices: {
        "Personal": 26000,
        "Duo": 43000,
        "Familiar": 60000,
        "Super Fam.": 70000
      }
    },
    {
      name: "Arroz con Costilla",
      description: "Camarón, jamón, raíz, costilla y papas a la francesa",
      category: "Arroces",
      prices: {
        "Personal": 26000,
        "Duo": 40000,
        "Familiar": 61000,
        "Super Fam.": 71000
      }
    },
    {
      name: "Arroz con Camarones",
      description: "Camarón, verduras y raíz",
      category: "Arroces",
      prices: {
        "Personal": 27000,
        "Duo": 48000,
        "Familiar": 73000,
        "Super Fam.": 86000
      }
    },
    {
      name: "Arroz Mixto",
      description: "Camarón, pollo, verduras y raíz",
      category: "Arroces",
      prices: {
        "Personal": 26000,
        "Duo": 41000,
        "Familiar": 59000,
        "Super Fam.": 68000
      }
    },
    {
      name: "Arroz Thai",
      description: "Pollo, camarón, cerdo, verduras y raíz",
      category: "Arroces",
      prices: {
        "Personal": 26000,
        "Duo": 39000,
        "Familiar": 60000,
        "Super Fam.": 72000
      }
    },
    {
      name: "Chop Suey",
      description: "Verduras salteadas con raíces chinas y carnes",
      category: "A la Carta",
      prices: {
        "Personal": 24000,
        "Mediana": 33000
      }
    },
    {
      name: "Sopa de Verduras",
      description: "Sopa casera con variedad de verduras frescas",
      category: "A la Carta",
      prices: {
        "Personal": 16000
      }
    },
    {
      name: "Chuleta (Adición)",
      description: "Porción extra de chuleta",
      category: "Adiciones",
      prices: {
        "Porción": 14000
      }
    },
    {
      name: "Costilla (Adición)",
      description: "Porción extra de costilla",
      category: "Adiciones",
      prices: {
        "Porción": 18000
      }
    },
    {
      name: "Camarón (Adición)",
      description: "Porción extra de camarón",
      category: "Adiciones",
      prices: {
        "Porción": 16000
      }
    },
    {
      name: "Chicharrón (Adición)",
      description: "Porción extra de chicharrón",
      category: "Adiciones",
      prices: {
        "Porción": 13000
      }
    },
    {
      name: "Chorizo (Adición)",
      description: "Porción extra de chorizo",
      category: "Adiciones",
      prices: {
        "Porción": 11000
      }
    },
    {
      name: "Papa Francesa (Adición)",
      description: "Porción de papas a la francesa",
      category: "Adiciones",
      prices: {
        "Porción": 11000
      }
    },
    {
      name: "Gaseosa / Coca-Cola",
      description: "Gaseosa refrescante",
      category: "Bebidas",
      prices: {
        "400 ml": 2500,
        "1.5 L": 7000
      }
    },
    {
      name: "Jugo Hit",
      description: "Jugo de fruta 500 ml",
      category: "Bebidas",
      prices: {
        "500 ml": 3000
      }
    },
    {
      name: "Agua en Botella",
      description: "Agua mineral natural",
      category: "Bebidas",
      prices: {
        "Unidad": 2000
      }
    }
  ];

  for (const item of menuItems) {
    console.log(`Processing product: ${item.name}`);
    
    let product = await prisma.product.findFirst({
      where: { name: item.name }
    });

    if (product) {
      product = await prisma.product.update({
        where: { id: product.id },
        data: {
          description: item.description,
          category: item.category,
        }
      });
    } else {
      product = await prisma.product.create({
        data: {
          name: item.name,
          description: item.description,
          category: item.category,
        }
      });
    }

    // Delete existing sizes and recreate to be clean
    await prisma.productSize.deleteMany({
      where: { productId: product.id }
    });

    for (const [sizeName, price] of Object.entries(item.prices)) {
      await prisma.productSize.create({
        data: {
          productId: product.id,
          name: sizeName,
          price: price,
        }
      });
    }
  }

  console.log("✅ Menu seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
