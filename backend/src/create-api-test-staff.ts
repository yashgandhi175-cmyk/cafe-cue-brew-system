import { PrismaClient, Role, StaffStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const phone = "+919999999902";
  const pin = "1234";

  const existing = await prisma.staff.findUnique({
    where: { phone },
  });

  if (existing) {
    console.log({
      message: "Test API staff already exists",
      id: existing.id,
      name: existing.name,
      role: existing.role,
    });
    return;
  }

  const pinHash = await bcrypt.hash(pin, 10);

  const staff = await prisma.staff.create({
    data: {
      name: "API Test Owner",
      phone,
      role: Role.OWNER,
      pinHash,
      mustChangePin: false,
      status: StaffStatus.ACTIVE,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      role: true,
      status: true,
      mustChangePin: true,
    },
  });

  console.log("Created API test staff:");
  console.log(staff);
  console.log("PIN:", pin);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
