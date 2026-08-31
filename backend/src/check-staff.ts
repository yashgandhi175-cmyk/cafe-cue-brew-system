import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const staff = await prisma.staff.findMany({
    select: {
      id: true,
      name: true,
      phone: true,
      role: true,
      status: true,
      mustChangePin: true,
    },
  });

  console.log(staff);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
