import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding tables...");

  const tables = [
    { number: "1" },
    { number: "2" },
    { number: "3" },
    { number: "4" },
    { number: "5" },
    { number: "6" },
    { number: "7" },
    { number: "8" },
    { number: "9" },
    { number: "10" },
    { number: "Para Llevar" },
    { number: "WhatsApp" },
  ];

  for (const t of tables) {
    await prisma.table.upsert({
      where: { number: t.number },
      update: {},
      create: {
        number: t.number,
        status: "AVAILABLE",
      },
    });
  }

  console.log("✅ Tables seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
