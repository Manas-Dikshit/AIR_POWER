import { prisma } from "../src/lib/prisma";
import { seedDemoData } from "../src/lib/seed";

async function main() {
  console.log("Seeding AIR POWER demonstration data...");
  const result = await seedDemoData();
  console.log(`Seed complete. Initial plan ${result.planId} applied (data version ${result.dataVersion}).`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("Seed failed:", error);
  await prisma.$disconnect();
  process.exit(1);
});
