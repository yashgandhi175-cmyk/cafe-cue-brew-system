import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.restaurantSettings.count();
  const staff = await prisma.staff.count();
  const categories = await prisma.category.count();
  const menuItems = await prisma.menuItem.count();
  const tables = await prisma.restaurantTable.count();
  const qrTokens = await prisma.tableQrToken.count();

  console.log({
    settings,
    staff,
    categories,
    menuItems,
    tables,
    qrTokens,
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
