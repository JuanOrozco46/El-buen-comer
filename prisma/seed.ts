import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding base users and settings...");

  const adminPassword = await bcrypt.hash("admin", 10);
  const employeePassword = await bcrypt.hash("123456", 10);

  // Seed Global Settings
  await prisma.globalSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      isPanicModeActive: false,
      restaurantName: "El buen comer",
    },
  });

  // Seed Roles
  const users = [
    { userName: "admin", name: "Administrador Global", role: "ADMIN", hashedPassword: adminPassword },
    { userName: "cajero", name: "Caja Principal", role: "CASHIER", hashedPassword: employeePassword },
    { userName: "mesero", name: "Mesa 1-10", role: "WAITER", hashedPassword: employeePassword },
    { userName: "chef", name: "Cocina Central", role: "CHEF", hashedPassword: employeePassword },
  ];

  for (const user of users) {
    // @ts-ignore - Dynamic role casting based on generated Prisma schema
    await prisma.user.upsert({
      where: { userName: user.userName },
      update: { hashedPassword: user.hashedPassword, role: user.role as any },
      create: {
        userName: user.userName,
        name: user.name,
        role: user.role as any,
        hashedPassword: user.hashedPassword,
      },
    });
  }

  console.log("Creating default ingredients...");
  
  const pollo = await prisma.ingredient.create({
    data: { name: "Pollo Desmechado", unit: "g", stock: 5000, minStock: 1000 }
  });
  
  const chorizo = await prisma.ingredient.create({
    data: { name: "Chorizo de Cerdo", unit: "unit", stock: 150, minStock: 30 }
  });

  console.log("Creating base product with sizes...");
  const arrozMaxi = await prisma.product.create({
    data: {
      name: "Arroz Especial El buen comer",
      description: "Pollo, chorizo, ranchera, camarón, cerdo, jamón, verduras y raíz.",
      category: "Arroces",
      sizes: {
        create: [
          { name: "Personal", price: 22000 },
          { name: "Medio", price: 35000 },
          { name: "Familiar", price: 48000 }
        ]
      }
    }
  });

  // Recipe linkage (mock for Personal size)
  await prisma.recipe.create({
    data: {
      productId: arrozMaxi.id,
      ingredientId: pollo.id,
      sizeName: "Personal",
      quantity: 150, // 150g of chicken
    }
  });

  await prisma.recipe.create({
    data: {
      productId: arrozMaxi.id,
      ingredientId: chorizo.id,
      sizeName: "Personal",
      quantity: 1, // 1 unit
    }
  });

  console.log("✅ Seed complete! Users created:");
  console.log("- admin / admin");
  console.log("- cajero / 123456");
  console.log("- mesero / 123456");
  console.log("- chef / 123456");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
