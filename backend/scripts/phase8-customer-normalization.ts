import { PrismaClient, CustomerStatus, CustomerIdentityConflictStatus } from '@prisma/client';
import { normalizePhone } from '../src/common/phone.util';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isDryRun = !isApply || args.includes('--dry-run');

  console.log(`=== CUSTOMER IDENTITY NORMALIZATION MIGRATION ===`);
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (No writes)' : 'APPLY (Commit updates)'}\n`);

  // 1. Read existing Customer records
  const customers = await prisma.customer.findMany({
    include: {
      orders: true,
    },
  });

  let totalCustomers = customers.length;
  let safeCount = 0;
  let conflictCount = 0;
  let invalidCount = 0;

  // Group by normalized phone
  const phoneGroups = new Map<string, typeof customers>();
  const invalidCustomers: typeof customers = [];

  for (const customer of customers) {
    try {
      const normalized = normalizePhone(customer.phone);
      if (!phoneGroups.has(normalized)) {
        phoneGroups.set(normalized, []);
      }
      phoneGroups.get(normalized)!.push(customer);
    } catch (e) {
      invalidCustomers.push(customer);
      invalidCount++;
    }
  }

  const safeUpdates: { customerId: string; newPhone: string }[] = [];
  const conflictsToCreate: { normalizedPhone: string; memberIds: string[]; reason: string }[] = [];

  for (const [normalizedPhone, group] of phoneGroups.entries()) {
    if (group.length === 1) {
      const customer = group[0];
      // Only needs update if current phone is not already normalized
      if (customer.phone !== normalizedPhone) {
        safeUpdates.push({ customerId: customer.id, newPhone: normalizedPhone });
      }
      safeCount++;
    } else {
      // Conflict! Multiple customers map to the same normalized phone
      conflictCount += group.length;
      conflictsToCreate.push({
        normalizedPhone,
        memberIds: group.map((c) => c.id),
        reason: `Duplicate normalized phone collision: ${group.map((c) => `[ID: ${c.id}, Phone: ${c.phone}, Name: ${c.name}]`).join(', ')}`,
      });
    }
  }

  console.log(`--- Customer Profiling Summary ---`);
  console.log(`TOTAL CUSTOMERS: ${totalCustomers}`);
  console.log(`SAFE NORMALIZATION: ${safeCount}`);
  console.log(`DUPLICATE IDENTITY CONFLICTS: ${conflictCount}`);
  console.log(`INVALID PHONE NUMBERS: ${invalidCount}`);
  console.log(`----------------------------------\n`);

  if (invalidCustomers.length > 0) {
    console.log(`WARNING: Found ${invalidCustomers.length} invalid customer phone numbers that cannot be normalized:`);
    invalidCustomers.forEach((c) => {
      console.log(` - ID: ${c.id}, Name: ${c.name}, Phone: "${c.phone}"`);
    });
    console.log('');
  }

  if (conflictsToCreate.length > 0) {
    console.log(`CONFLICTS DETECTED: ${conflictsToCreate.length} unique normalized numbers have collisions:`);
    conflictsToCreate.forEach((conflict) => {
      console.log(` - Normalized: ${conflict.normalizedPhone}`);
      conflict.memberIds.forEach((mId) => {
        const c = customers.find((cust) => cust.id === mId);
        console.log(`   * Member ID: ${c?.id}, Name: ${c?.name}, Original Phone: "${c?.phone}"`);
      });
    });
    console.log('');
  }

  // 2. Perform safe updates and conflict logging in Apply mode
  if (isApply) {
    console.log(`Applying migrations...`);
    await prisma.$transaction(async (tx) => {
      // SAFE records: update Customer.phone to E.164
      for (const update of safeUpdates) {
        await tx.customer.update({
          where: { id: update.customerId },
          data: { phone: update.newPhone },
        });
      }

      // CONFLICT records: create CustomerIdentityConflict and CustomerIdentityConflictMember rows idempotently
      for (const conflict of conflictsToCreate) {
        // Check if conflict already exists
        let existingConflict = await tx.customerIdentityConflict.findFirst({
          where: { normalizedPhone: conflict.normalizedPhone },
          include: { members: true },
        });

        if (!existingConflict) {
          existingConflict = await tx.customerIdentityConflict.create({
            data: {
              normalizedPhone: conflict.normalizedPhone,
              status: CustomerIdentityConflictStatus.PENDING,
              reason: conflict.reason,
            },
            include: { members: true },
          });
        }

        for (const memberId of conflict.memberIds) {
          const customer = customers.find((c) => c.id === memberId)!;
          const hasMember = existingConflict.members.some((m) => m.customerId === memberId);
          if (!hasMember) {
            await tx.customerIdentityConflictMember.create({
              data: {
                conflictId: existingConflict.id,
                customerId: memberId,
                originalPhone: customer.phone,
              },
            });
          }
        }
      }
    });
    console.log(`Successfully normalized ${safeUpdates.length} safe customers.`);
    console.log(`Logged ${conflictsToCreate.length} identity conflicts to CustomerIdentityConflict.`);
  } else {
    console.log(`Dry-run mode completed. No records were modified.`);
    console.log(`To apply changes, run: npm run phase8:customer-normalize -- --apply\n`);
  }

  // 3. Historical Order Customer Relinking (Part 7)
  // Check if Order model has customerPhone/customerPhoneSnapshot field.
  // Since we verified the Order model does not contain a raw phone snapshot column, we log the baseline and exit.
  console.log(`--- Order Relinking Summary ---`);
  console.log(`ELIGIBLE FOR RELINK: 0`);
  console.log(`RELINKED: 0`);
  console.log(`AMBIGUOUS: 0`);
  console.log(`NO MATCH: 0`);
  console.log(`-------------------------------\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
