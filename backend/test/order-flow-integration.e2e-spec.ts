import { PrismaClient } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from '../src/orders/orders.service';
import { AppModule } from '../src/app.module';
import { Role } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('MySQL Database Integration Tests & Safety Guards', () => {
  let prisma: PrismaClient | null = null;
  let ordersService: OrdersService | null = null;
  let moduleFixture: TestingModule | null = null;

  const isTestEnv = process.env.NODE_ENV === 'test';
  const testDbUrl = process.env.TEST_DATABASE_URL;
  const prodDbUrl = process.env.DATABASE_URL || '';

  beforeAll(async () => {
    // 1. Safety Guard: Integration tests must refuse to run if TEST_DATABASE_URL is missing under NODE_ENV=test
    if (!testDbUrl) {
      console.log(
        'MYSQL PHASE 8C: NOT RUN — TEST DATABASE NOT CONFIGURED',
      );
      console.warn(
        '⚠️  [SAFETY GUARD] TEST_DATABASE_URL is missing. Skipping MySQL integration tests.',
      );
      return;
    }

    // 2. Safety Guard: Refuse destructive test execution if host/name is equal to production database
    if (testDbUrl) {
      if (
        testDbUrl === prodDbUrl ||
        prodDbUrl.includes('hostinger') ||
        testDbUrl.includes('hostinger') ||
        testDbUrl.includes('cue-brew-prod')
      ) {
        throw new Error(
          '❌ [SAFETY GUARD VIOLATION] Refusing to execute destructive tests: TEST_DATABASE_URL matches production database or contains restricted production keywords.',
        );
      }

      // Initialize Prisma client with the test database URL
      prisma = new PrismaClient({
        datasources: {
          db: {
            url: testDbUrl,
          },
        },
      });

      // Boot Nest app container with test db URL
      process.env.DATABASE_URL = testDbUrl;
      moduleFixture = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      ordersService = moduleFixture.get<OrdersService>(OrdersService);
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (moduleFixture) {
      await moduleFixture.close();
    }
  });

  it('Verify integration test database config & execution safety rules', async () => {
    if (!prisma) {
      console.log('MYSQL PHASE 8C: NOT RUN — TEST DATABASE NOT CONFIGURED');
      return;
    }

    // Test a basic query to prove database connection and query capabilities
    const result = await prisma.$queryRaw`SELECT 1 + 1 as sum`;
    expect(result).toBeDefined();
    expect((result as { sum: number }[])[0].sum).toBe(2);
  });

  it('Verify negative loyalty reversal balance failure path', async () => {
    if (!prisma || !ordersService) {
      console.log('MYSQL PHASE 8C: NOT RUN — TEST DATABASE NOT CONFIGURED');
      return;
    }

    // Clean tables in correct order
    await prisma.auditLog.deleteMany({});
    await prisma.loyaltyTransaction.deleteMany({});
    await prisma.loyaltyRedemptionRequest.deleteMany({});
    await prisma.bill.deleteMany({});
    await prisma.orderStatusHistory.deleteMany({});
    await prisma.orderItem.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.customer.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.restaurantTable.deleteMany({});

    // 1. Create dummy staff
    await prisma.staff.create({
      data: {
        id: 'test-staff-1',
        name: 'Test Staff',
        phone: '+919999999901',
        role: 'OWNER',
        pinHash: 'dummy-hash',
      },
    });

    // 2. Create customer with loyalty balance insufficient for EARN reversal
    const customer = await prisma.customer.create({
      data: {
        id: 'test-cust-1',
        name: 'Test Customer',
        phone: '+919999999902',
        loyaltyPoints: 5, // insufficient (earn is 10)
      },
    });

    // 3. Create table
    await prisma.restaurantTable.create({
      data: {
        id: 'test-table-1',
        tableNumber: 'T101',
        capacity: 4,
      },
    });

    // 4. Create order and bill state eligible for cancellation or void reversal
    const order = await prisma.order.create({
      data: {
        id: 'test-order-1',
        orderNumber: 'ORD-101',
        publicTrackingToken: 'token-101',
        source: 'OWNER_POS',
        status: 'RECEIVED',
        paymentStatus: 'UNPAID',
        subtotal: 1000.0,
        taxableAmount: 1000.0,
        grandTotal: 1000.0,
        customerId: customer.id,
        tableId: 'test-table-1',
      },
    });

    const bill = await prisma.bill.create({
      data: {
        id: 'test-bill-1',
        orderId: order.id,
        status: 'FINALIZED',
        subtotal: 1000.0,
        taxableAmount: 1000.0,
        grandTotal: 1000.0,
      },
    });

    // 5. Create original EARN transaction for 10 points
    await prisma.loyaltyTransaction.create({
      data: {
        id: 'test-tx-1',
        customerId: customer.id,
        type: 'EARN',
        pointsChange: 10,
        balanceAfter: 15,
        billId: bill.id,
        orderId: order.id,
        idempotencyKey: `LOYALTY_EARN:${bill.id}`,
      },
    });

    // 6. Trigger the negative reversal path and assert controlled error
    await expect(
      ordersService.cancelOrder(
        order.id,
        'No show',
        undefined,
        'test-staff-1',
        Role.OWNER,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'Loyalty reversal blocked: customer has already consumed the earned points and reversal would make their balance negative.',
      ),
    );

    // Verify database state: order cancellation/void transaction did not partially commit (still RECEIVED status)
    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
    });
    expect(updatedOrder?.status).toBe('RECEIVED');

    // No EARN_REVERSAL transaction created
    const earnReversalTx = await prisma.loyaltyTransaction.findFirst({
      where: { type: 'EARN_REVERSAL', billId: bill.id },
    });
    expect(earnReversalTx).toBeNull();

    // Customer loyaltyPoints remains unchanged (5)
    const updatedCustomer = await prisma.customer.findUnique({
      where: { id: customer.id },
    });
    expect(updatedCustomer?.loyaltyPoints).toBe(5);

    // AuditLog contains exactly one: LOYALTY_REVERSAL_BLOCKED_NEGATIVE_BALANCE
    const auditLogs = await prisma.auditLog.findMany({
      where: { action: 'LOYALTY_REVERSAL_BLOCKED_NEGATIVE_BALANCE' },
    });
    expect(auditLogs.length).toBe(1);

    // Repeat the operation and assert it behaves identically (policy: one event per blocked attempt)
    await expect(
      ordersService.cancelOrder(
        order.id,
        'No show',
        undefined,
        'test-staff-1',
        Role.OWNER,
      ),
    ).rejects.toThrow(BadRequestException);

    const repeatAuditLogs = await prisma.auditLog.findMany({
      where: { action: 'LOYALTY_REVERSAL_BLOCKED_NEGATIVE_BALANCE' },
    });
    expect(repeatAuditLogs.length).toBe(2); // one event per blocked attempt
  });
});
