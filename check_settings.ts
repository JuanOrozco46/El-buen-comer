import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const settings = await (prisma as any).globalSettings.findMany();
  console.log('GlobalSettings records:', JSON.stringify(settings, null, 2));
  
  const allUsers = await prisma.user.findMany();
  console.log('All Users count:', allUsers.length);
  allUsers.forEach(u => console.log(`- ${u.name} (ID: ${u.id}, Role: ${u.role})`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
