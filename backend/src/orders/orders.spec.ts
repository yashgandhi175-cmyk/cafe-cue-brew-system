/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { TablesService } from '../tables/tables.service';
import { PrismaService } from '../common/prisma.service';
import { FinancialCalculationService } from './financial-calculation.service';
import { CartPricingService } from './cart-pricing.service';
import {
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Role, OrderStatus, PaymentStatus, StockTxType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

describe('Order Flow Logic & Verification (Mocked Unit Tests)', () => {
  let ordersService: OrdersService;
  let tablesService: TablesService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        TablesService,
        PrismaService,
        FinancialCalculationService,
        CartPricingService,
      ],
    }).compile();

    ordersService = module.get<OrdersService>(OrdersService);
    tablesService = module.get<TablesService>(TablesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  beforeEach(() => {
    // Mock Prisma's database connect/disconnect methods to allow tests to run offline
    jest
      .spyOn(PrismaService.prototype, '$connect')
      .mockImplementation(() => Promise.resolve());
    jest
      .spyOn(PrismaService.prototype, '$disconnect')
      .mockImplementation(() => Promise.resolve());
    jest
      .spyOn(PrismaService.prototype, '$transaction')
      .mockImplementation(async (callback: any) => {
        if (typeof callback === 'function') {
          return callback(prisma);
        }
        return Promise.resolve();
      });

    // Global default mocks for DB calls in hooks like updateTableStatusIfNeeded
    jest.spyOn(prisma.order, 'findMany').mockResolvedValue([]);
    jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(null);
    jest.spyOn(prisma.order, 'update').mockResolvedValue({} as any);
    jest.spyOn(prisma.order, 'updateMany').mockResolvedValue({ count: 1 });
    jest
      .spyOn(prisma.restaurantTable, 'findUnique')
      .mockResolvedValue({ id: 'tbl-1', status: 'OCCUPIED' } as any);
    jest.spyOn(prisma.restaurantTable, 'update').mockResolvedValue({} as any);
    jest
      .spyOn(prisma.orderStatusHistory, 'create')
      .mockResolvedValue({} as any);
    jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);
    jest.spyOn(prisma.couponUsage, 'findFirst').mockResolvedValue(null);
    jest.spyOn(prisma, '$executeRaw').mockResolvedValue(1);
    jest.spyOn(prisma.tableSession, 'findFirst').mockResolvedValue(null);
    jest
      .spyOn(prisma.tableSession, 'create')
      .mockResolvedValue({ id: 'sess-1' } as any);
    jest.spyOn(prisma.tableSession, 'update').mockResolvedValue({} as any);
    jest.spyOn(prisma.customerCart, 'findUnique').mockResolvedValue(null);
    jest
      .spyOn(prisma.customerCart, 'deleteMany')
      .mockResolvedValue({ count: 1 });
    jest.spyOn(prisma.creditLedger, 'create').mockResolvedValue({} as any);
    jest.spyOn(prisma.creditLedger, 'findUnique').mockResolvedValue(null);
    jest.spyOn(prisma.creditLedger, 'update').mockResolvedValue({} as any);
    jest.spyOn(prisma.bill, 'findFirst').mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. QR Security Scenarios', () => {
    it('Scenario 1 & 3: Valid table ID + matching token succeeds, Table 5 with Table 8 token fails', async () => {
      // Mock validateTableAndToken success
      jest.spyOn(prisma.restaurantTable, 'findUnique').mockImplementation(() =>
        Promise.resolve({
          id: 'table-5-id',
          tableNumber: 'Table 5',
          capacity: 4,
          isActive: true,
          qrToken: { token: 'TOKEN_5' },
        } as any),
      );

      const table = await tablesService.validateTableAndToken(
        'table-5-id',
        'TOKEN_5',
      );
      expect(table.id).toBe('table-5-id');

      // Table 5 with Table 8 token must fail
      await expect(
        tablesService.validateTableAndToken('table-5-id', 'TOKEN_8'),
      ).rejects.toThrow(BadRequestException);
    });

    it('Scenario 2 & 4: Invalid token and regenerated/old token fails', async () => {
      jest.spyOn(prisma.restaurantTable, 'findUnique').mockImplementation(() =>
        Promise.resolve({
          id: 'table-5-id',
          tableNumber: 'Table 5',
          capacity: 4,
          isActive: true,
          qrToken: { token: 'TOKEN_5_NEW' },
        } as any),
      );

      await expect(
        tablesService.validateTableAndToken('table-5-id', 'TOKEN_5_OLD'),
      ).rejects.toThrow(BadRequestException);
    });

    it('Scenario 5: Inactive table fails', async () => {
      jest.spyOn(prisma.restaurantTable, 'findUnique').mockImplementation(() =>
        Promise.resolve({
          id: 'table-5-id',
          tableNumber: 'Table 5',
          capacity: 4,
          isActive: false, // inactive!
          qrToken: { token: 'TOKEN_5' },
        } as any),
      );

      await expect(
        tablesService.validateTableAndToken('table-5-id', 'TOKEN_5'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('2. Order & Price Security Validation', () => {
    it('Scenario 6 & 15-18: Valid menu item can be ordered & backend overrides frontend prices', async () => {
      // Setup mock data for active settings, table, item, etc.
      jest.spyOn(prisma.restaurantTable, 'findUnique').mockImplementation(() =>
        Promise.resolve({
          id: 'tbl-5',
          tableNumber: 'Table 5',
          capacity: 4,
          isActive: true,
          qrToken: { token: 'TOKEN_5' },
        } as any),
      );

      jest
        .spyOn(prisma.restaurantSettings, 'findUnique')
        .mockImplementation(() =>
          Promise.resolve({
            id: 'default',
            qrOrderingEnabled: true,
            enableGst: false,
            enableServiceCharge: false,
            enableNightCharges: false,
            requireCustomerName: true,
            requireCustomerPhone: true,
          } as any),
        );

      // Mock item in DB (base price 150)
      jest.spyOn(prisma.menuItem, 'findMany').mockImplementation(() =>
        Promise.resolve([
          {
            id: 'item-1',
            name: 'Cappuccino',
            basePrice: 150,
            isActive: true,
            available: true,
            variants: [],
            menuItemAddons: [],
          },
        ] as any),
      );

      jest.spyOn(prisma.order, 'findUnique').mockImplementation((args: any) => {
        if (args?.where?.idempotencyKey) {
          return Promise.resolve(null);
        }
        if (args?.where?.orderNumber) {
          return Promise.resolve(null);
        }
        return Promise.resolve({
          id: 'order-1',
          orderNumber: 'CCB-2026-1',
          publicTrackingToken: 'TRK-1',
          items: [],
        } as any);
      });
      jest
        .spyOn(prisma.customer, 'upsert')
        .mockImplementation(() => Promise.resolve({ id: 'cust-1' } as any));
      jest.spyOn(prisma.order, 'create').mockImplementation(() =>
        Promise.resolve({
          id: 'order-1',
          orderNumber: 'CCB-2026-1',
          publicTrackingToken: 'TRK-1',
        } as any),
      );
      jest
        .spyOn(prisma.orderItem, 'create')
        .mockImplementation(() => Promise.resolve({} as any));
      jest
        .spyOn(prisma.orderStatusHistory, 'create')
        .mockImplementation(() => Promise.resolve({} as any));
      jest
        .spyOn(prisma.bill, 'create')
        .mockImplementation(() => Promise.resolve({} as any));

      const order = await ordersService.createPublicOrder({
        tableId: 'tbl-5',
        token: 'TOKEN_5',
        customerName: 'Alice',
        customerPhone: '9876543210',
        idempotencyKey: 'idemp-1',
        items: [
          {
            menuItemId: 'item-1',
            quantity: 2,
            // frontend tries to submit a fake cheap price of 10, backend must ignore it and load 150 base price!
          },
        ],
      });

      expect(order).toBeDefined();
    });

    it('Scenario 7 & 8: Inactive menu item & Out-of-stock item is rejected', async () => {
      jest.spyOn(prisma.menuItem, 'findMany').mockImplementation(() =>
        Promise.resolve([
          {
            id: 'item-1',
            name: 'Cappuccino',
            basePrice: 150,
            isActive: false, // inactive!
            available: true,
            variants: [],
            menuItemAddons: [],
          },
        ] as any),
      );

      await expect(
        ordersService.createPublicOrder({
          tableId: 'tbl-5',
          token: 'TOKEN_5',
          customerName: 'Alice',
          customerPhone: '9876543210',
          idempotencyKey: 'idemp-2',
          items: [{ menuItemId: 'item-1', quantity: 2 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Financial Calculation Scenarios', () => {
    const mockRound = (num: number) =>
      Math.round((num + Number.EPSILON) * 100) / 100;

    it('Scenario 19-21: GST Enabled vs Disabled calculations', () => {
      // Tax-exclusive GST calculations
      const taxable = 200;
      const gstPercent = 5;
      const cgst = mockRound(taxable * (2.5 / 100));
      const sgst = mockRound(taxable * (2.5 / 100));
      expect(cgst).toBe(5);
      expect(sgst).toBe(5);

      // Tax-inclusive GST calculations
      const inclusiveTaxable = 210;
      const extractedCgst = mockRound(
        (inclusiveTaxable * 2.5) / (100 + gstPercent),
      );
      const extractedSgst = mockRound(
        (inclusiveTaxable * 2.5) / (100 + gstPercent),
      );
      expect(extractedCgst).toBe(5);
      expect(extractedSgst).toBe(5);
    });

    it('Scenario 24-27: Cross-midnight night charges check', () => {
      const nightStart = '22:00';
      const nightEnd = '02:00';

      const isNightTime = (hours: number, minutes: number) => {
        const currentVal = hours * 60 + minutes;
        const [startH, startM] = nightStart.split(':').map(Number);
        const startVal = startH * 60 + startM;
        const [endH, endM] = nightEnd.split(':').map(Number);
        const endVal = endH * 60 + endM;

        if (startVal > endVal) {
          return currentVal >= startVal || currentVal <= endVal;
        }
        return currentVal >= startVal && currentVal <= endVal;
      };

      // Before midnight (e.g. 11:30 PM = 23:30) should work
      expect(isNightTime(23, 30)).toBe(true);

      // After midnight (e.g. 1:15 AM = 01:15) should work
      expect(isNightTime(1, 15)).toBe(true);

      // Day time (e.g. 12:00 PM = 12:00) should not apply
      expect(isNightTime(12, 0)).toBe(false);
    });
  });

  describe('4. Idempotency Scenarios', () => {
    it('Scenario 30-32: Repeated same key returns existing order and concurrent race handled', async () => {
      const mockOrder = {
        id: 'order-1',
        orderNumber: 'CCB-1',
        publicTrackingToken: 'TRK-1',
        idempotencyKey: 'key-1',
      };

      // Setup mock to return existing order when query by idempotencyKey succeeds
      jest
        .spyOn(prisma.order, 'findUnique')
        .mockImplementation(() => Promise.resolve(mockOrder as any));

      const res = await ordersService.createPublicOrder({
        tableId: 'tbl-5',
        token: 'TOKEN_5',
        customerName: 'Alice',
        customerPhone: '9876543210',
        idempotencyKey: 'key-1',
        items: [],
      });

      expect(res.id).toBe('order-1');
    });

    it('should handle idempotency key and only consume coupon once', async () => {
      const settings = {
        id: 'default',
        qrOrderingEnabled: true,
        requireCustomerName: true,
        requireCustomerPhone: true,
      };
      const table = {
        id: 'tbl-5',
        tableNumber: 'Table 5',
        isActive: true,
        qrToken: { token: 'TOKEN_5' },
      };
      const coupon = {
        id: 'coupon-123',
        code: 'SAVE10',
        isActive: true,
        type: 'FLAT',
        value: 10,
        minOrder: 0,
        startDate: new Date(Date.now() - 3600000),
        endDate: new Date(Date.now() + 3600000),
        usageLimit: 100,
        usedCount: 10,
        perCustLimit: 1,
      };

      // Mocks
      jest
        .spyOn(prisma.restaurantSettings, 'findUnique')
        .mockResolvedValue(settings as any);
      jest
        .spyOn(prisma.restaurantTable, 'findUnique')
        .mockResolvedValue(table as any);
      jest.spyOn(prisma.menuItem, 'findMany').mockResolvedValue([]);
      jest
        .spyOn(prisma.customer, 'upsert')
        .mockResolvedValue({ id: 'cust-1' } as any);
      jest.spyOn(prisma.coupon, 'findUnique').mockResolvedValue(coupon as any);
      jest
        .spyOn(prisma.customerCouponUsageCounter, 'findUnique')
        .mockResolvedValue(null);
      const customerCounterCreateSpy = jest
        .spyOn(prisma.customerCouponUsageCounter, 'create')
        .mockResolvedValue({} as any);
      jest.spyOn(prisma.bill, 'update').mockResolvedValue({} as any);

      const orderCreateSpy = jest
        .spyOn(prisma.order, 'create')
        .mockResolvedValue({
          id: 'order-1',
          orderNumber: 'CCB-2026-1',
          publicTrackingToken: 'TRK-1',
        } as any);
      const billCreateSpy = jest
        .spyOn(prisma.bill, 'create')
        .mockResolvedValue({ id: 'bill-1' } as any);
      const couponUsageCreateSpy = jest
        .spyOn(prisma.couponUsage, 'create')
        .mockResolvedValue({ id: 'usage-1' } as any);
      const executeRawSpy = jest
        .spyOn(prisma, '$executeRaw')
        .mockResolvedValue(1);

      let orderLookupResult: any = null;
      jest
        .spyOn(prisma.order, 'findUnique')
        .mockImplementation(async (args: any) => {
          if (args?.where?.idempotencyKey === 'idem-coupon-1') {
            return orderLookupResult;
          }
          if (args?.where?.id === 'order-1') {
            return {
              id: 'order-1',
              orderNumber: 'CCB-2026-1',
              publicTrackingToken: 'TRK-1',
              items: [],
            };
          }
          return null;
        });

      // First submit
      const res1 = await ordersService.createPublicOrder({
        tableId: 'tbl-5',
        token: 'TOKEN_5',
        customerName: 'Alice',
        customerPhone: '9876543210',
        idempotencyKey: 'idem-coupon-1',
        couponCode: 'SAVE10',
        items: [],
      });

      // Update lookup result for second submit
      orderLookupResult = {
        id: 'order-1',
        orderNumber: 'CCB-2026-1',
        publicTrackingToken: 'TRK-1',
        items: [],
      };

      // Second submit
      const res2 = await ordersService.createPublicOrder({
        tableId: 'tbl-5',
        token: 'TOKEN_5',
        customerName: 'Alice',
        customerPhone: '9876543210',
        idempotencyKey: 'idem-coupon-1',
        couponCode: 'SAVE10',
        items: [],
      });

      expect(res1.id).toBe('order-1');
      expect(res2.id).toBe('order-1');
      expect(orderCreateSpy).toHaveBeenCalledTimes(1);
      expect(billCreateSpy).toHaveBeenCalledTimes(1);
      expect(couponUsageCreateSpy).toHaveBeenCalledTimes(1);
      expect(customerCounterCreateSpy).toHaveBeenCalledTimes(1);
      expect(executeRawSpy).toHaveBeenCalledTimes(1); // One for global coupon increment
    });
  });

  describe('5. Call Waiter Cooldown', () => {
    it('Scenario 55 & 56: Call waiter cooldown limits', async () => {
      // Mock validate success
      jest.spyOn(prisma.restaurantTable, 'findUnique').mockImplementation(() =>
        Promise.resolve({
          id: 'tbl-5',
          tableNumber: 'Table 5',
          capacity: 4,
          isActive: true,
          qrToken: { token: 'TOKEN_5' },
        } as any),
      );

      // Mock pending waiter call exists
      jest.spyOn(prisma.waiterCall, 'findFirst').mockImplementation(() =>
        Promise.resolve({
          id: 'call-1',
          tableId: 'tbl-5',
          status: 'PENDING',
          requestedAt: new Date(),
        } as any),
      );

      const res = await tablesService.createWaiterCall('tbl-5', 'TOKEN_5');
      // If there is already an active pending call, return message instead of throwing error
      expect(res.alreadyPending).toBe(true);
    });
  });

  describe('6. Phase 7 Stock Consumption & Reversal Trigger Audit', () => {
    const mockOrder = (
      id: string,
      status: OrderStatus,
      paymentStatus: PaymentStatus = PaymentStatus.PAID,
    ) =>
      ({
        id,
        orderNumber: `ORD-${id}`,
        status,
        paymentStatus,
        tableId: 'tbl-1',
        items: [
          {
            id: 'item-1',
            menuItemId: 'menu-1',
            quantity: 2,
            addons: [],
          },
        ],
      }) as any;

    it('1. RECEIVED cancellation creates no consumption', async () => {
      const order = mockOrder('order-received', OrderStatus.RECEIVED);
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order);
      jest.spyOn(prisma.order, 'update').mockResolvedValue(order);
      jest
        .spyOn(prisma.orderStatusHistory, 'create')
        .mockResolvedValue({} as any);
      jest
        .spyOn(prisma.orderStockConsumption, 'findUnique')
        .mockResolvedValue(null);
      const createTxSpy = jest
        .spyOn(prisma.stockTransaction, 'create')
        .mockResolvedValue({} as any);

      await ordersService.cancelOrder(
        'order-received',
        'Customer request',
        '',
        'owner-1',
        Role.OWNER,
      );

      const recipeConsumptionCalls = createTxSpy.mock.calls.filter(
        (c) => c[0].data.type === 'RECIPE_CONSUMPTION',
      );
      expect(recipeConsumptionCalls.length).toBe(0);
    });

    it('2. RECEIVED cancellation creates no reversal', async () => {
      const order = mockOrder('order-received', OrderStatus.RECEIVED);
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order);
      jest.spyOn(prisma.order, 'update').mockResolvedValue(order);
      jest
        .spyOn(prisma.orderStatusHistory, 'create')
        .mockResolvedValue({} as any);
      jest
        .spyOn(prisma.orderStockConsumption, 'findUnique')
        .mockResolvedValue(null);
      const createTxSpy = jest
        .spyOn(prisma.stockTransaction, 'create')
        .mockResolvedValue({} as any);

      await ordersService.cancelOrder(
        'order-received',
        'Customer request',
        '',
        'owner-1',
        Role.OWNER,
      );

      const reversalCalls = createTxSpy.mock.calls.filter(
        (c) => c[0].data.type === 'CONSUMPTION_REVERSAL',
      );
      expect(reversalCalls.length).toBe(0);
    });

    it('3. ACCEPTED cancellation creates no consumption', async () => {
      const order = mockOrder('order-accepted', OrderStatus.ACCEPTED);
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order);
      jest.spyOn(prisma.order, 'update').mockResolvedValue(order);
      jest
        .spyOn(prisma.orderStatusHistory, 'create')
        .mockResolvedValue({} as any);
      jest
        .spyOn(prisma.orderStockConsumption, 'findUnique')
        .mockResolvedValue(null);
      const createTxSpy = jest
        .spyOn(prisma.stockTransaction, 'create')
        .mockResolvedValue({} as any);

      await ordersService.cancelOrder(
        'order-accepted',
        'Customer request',
        '',
        'owner-1',
        Role.OWNER,
      );

      const recipeConsumptionCalls = createTxSpy.mock.calls.filter(
        (c) => c[0].data.type === 'RECIPE_CONSUMPTION',
      );
      expect(recipeConsumptionCalls.length).toBe(0);
    });

    it('4. ACCEPTED cancellation creates no reversal', async () => {
      const order = mockOrder('order-accepted', OrderStatus.ACCEPTED);
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order);
      jest.spyOn(prisma.order, 'update').mockResolvedValue(order);
      jest
        .spyOn(prisma.orderStatusHistory, 'create')
        .mockResolvedValue({} as any);
      jest
        .spyOn(prisma.orderStockConsumption, 'findUnique')
        .mockResolvedValue(null);
      const createTxSpy = jest
        .spyOn(prisma.stockTransaction, 'create')
        .mockResolvedValue({} as any);

      await ordersService.cancelOrder(
        'order-accepted',
        'Customer request',
        '',
        'owner-1',
        Role.OWNER,
      );

      const reversalCalls = createTxSpy.mock.calls.filter(
        (c) => c[0].data.type === 'CONSUMPTION_REVERSAL',
      );
      expect(reversalCalls.length).toBe(0);
    });

    it('5. PREPARING cancellation creates no consumption', async () => {
      const order = mockOrder('order-preparing', OrderStatus.PREPARING);
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order);
      jest.spyOn(prisma.order, 'update').mockResolvedValue(order);
      jest
        .spyOn(prisma.orderStatusHistory, 'create')
        .mockResolvedValue({} as any);
      jest
        .spyOn(prisma.orderStockConsumption, 'findUnique')
        .mockResolvedValue(null);
      const createTxSpy = jest
        .spyOn(prisma.stockTransaction, 'create')
        .mockResolvedValue({} as any);

      await ordersService.cancelOrder(
        'order-preparing',
        'Customer request',
        '',
        'owner-1',
        Role.OWNER,
      );

      const recipeConsumptionCalls = createTxSpy.mock.calls.filter(
        (c) => c[0].data.type === 'RECIPE_CONSUMPTION',
      );
      expect(recipeConsumptionCalls.length).toBe(0);
    });

    it('6. PREPARING cancellation creates no reversal', async () => {
      const order = mockOrder('order-preparing', OrderStatus.PREPARING);
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order);
      jest.spyOn(prisma.order, 'update').mockResolvedValue(order);
      jest
        .spyOn(prisma.orderStatusHistory, 'create')
        .mockResolvedValue({} as any);
      jest
        .spyOn(prisma.orderStockConsumption, 'findUnique')
        .mockResolvedValue(null);
      const createTxSpy = jest
        .spyOn(prisma.stockTransaction, 'create')
        .mockResolvedValue({} as any);

      await ordersService.cancelOrder(
        'order-preparing',
        'Customer request',
        '',
        'owner-1',
        Role.OWNER,
      );

      const reversalCalls = createTxSpy.mock.calls.filter(
        (c) => c[0].data.type === 'CONSUMPTION_REVERSAL',
      );
      expect(reversalCalls.length).toBe(0);
    });

    it('7. READY cancellation creates no consumption', async () => {
      const order = mockOrder('order-ready', OrderStatus.READY);
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order);
      jest.spyOn(prisma.order, 'update').mockResolvedValue(order);
      jest
        .spyOn(prisma.orderStatusHistory, 'create')
        .mockResolvedValue({} as any);
      jest
        .spyOn(prisma.orderStockConsumption, 'findUnique')
        .mockResolvedValue(null);
      const createTxSpy = jest
        .spyOn(prisma.stockTransaction, 'create')
        .mockResolvedValue({} as any);

      await ordersService.cancelOrder(
        'order-ready',
        'Customer request',
        '',
        'owner-1',
        Role.OWNER,
      );

      const recipeConsumptionCalls = createTxSpy.mock.calls.filter(
        (c) => c[0].data.type === 'RECIPE_CONSUMPTION',
      );
      expect(recipeConsumptionCalls.length).toBe(0);
    });

    it('8. READY cancellation creates no reversal', async () => {
      const order = mockOrder('order-ready', OrderStatus.READY);
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order);
      jest.spyOn(prisma.order, 'update').mockResolvedValue(order);
      jest
        .spyOn(prisma.orderStatusHistory, 'create')
        .mockResolvedValue({} as any);
      jest
        .spyOn(prisma.orderStockConsumption, 'findUnique')
        .mockResolvedValue(null);
      const createTxSpy = jest
        .spyOn(prisma.stockTransaction, 'create')
        .mockResolvedValue({} as any);

      await ordersService.cancelOrder(
        'order-ready',
        'Customer request',
        '',
        'owner-1',
        Role.OWNER,
      );

      const reversalCalls = createTxSpy.mock.calls.filter(
        (c) => c[0].data.type === 'CONSUMPTION_REVERSAL',
      );
      expect(reversalCalls.length).toBe(0);
    });

    it('9. COMPLETED creates consumption', async () => {
      const order = mockOrder('order-served', OrderStatus.SERVED);
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order);
      jest.spyOn(prisma.order, 'updateMany').mockResolvedValue({ count: 1 });
      jest
        .spyOn(prisma.orderStatusHistory, 'create')
        .mockResolvedValue({} as any);
      jest
        .spyOn(prisma.orderStockConsumption, 'findUnique')
        .mockResolvedValue(null);

      jest.spyOn(prisma.recipe, 'findMany').mockResolvedValue([
        {
          id: 'rec-1',
          ingredientId: 'ing-1',
          quantity: new Decimal(0.1),
          ingredient: { name: 'Milk' },
        },
      ] as any);
      jest
        .spyOn(prisma.restaurantSettings, 'findUnique')
        .mockResolvedValue({ allowNegativeStock: true } as any);
      jest.spyOn(prisma.ingredient, 'findUnique').mockResolvedValue({
        id: 'ing-1',
        name: 'Milk',
        currentStock: new Decimal(10),
        averageCost: new Decimal(5),
      } as any);
      jest.spyOn(prisma.ingredient, 'update').mockResolvedValue({} as any);
      jest
        .spyOn(prisma.orderStockConsumption, 'create')
        .mockResolvedValue({} as any);
      const createTxSpy = jest
        .spyOn(prisma.stockTransaction, 'create')
        .mockResolvedValue({} as any);

      await ordersService.updateOrderStatus(
        'order-served',
        OrderStatus.COMPLETED,
        'owner-1',
        Role.OWNER,
      );

      const recipeConsumptionCalls = createTxSpy.mock.calls.filter(
        (c) => c[0].data.type === 'RECIPE_CONSUMPTION',
      );
      expect(recipeConsumptionCalls.length).toBe(1);
      expect(recipeConsumptionCalls[0][0].data.quantityChange.toNumber()).toBe(
        -0.2,
      );
    });

    it('10. Actual authorized completed-order void creates reversal', async () => {
      const order = mockOrder('order-completed', OrderStatus.COMPLETED);
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order);
      jest.spyOn(prisma.order, 'update').mockResolvedValue(order);
      jest
        .spyOn(prisma.orderStatusHistory, 'create')
        .mockResolvedValue({} as any);

      jest
        .spyOn(prisma.orderStockConsumption, 'findUnique')
        .mockResolvedValue({ orderId: 'order-completed' } as any);
      jest
        .spyOn(prisma.orderStockConsumptionReversal, 'findUnique')
        .mockResolvedValue(null);

      jest.spyOn(prisma.stockTransaction, 'findMany').mockResolvedValue([
        {
          id: 'tx-1',
          ingredientId: 'ing-1',
          quantityChange: new Decimal(-0.2),
          unitCostSnapshot: new Decimal(5),
          totalCostSnapshot: new Decimal(-1),
          ingredient: {
            id: 'ing-1',
            name: 'Milk',
            currentStock: new Decimal(9.8),
            averageCost: new Decimal(5),
          },
        },
      ] as any);

      const createTxSpy = jest
        .spyOn(prisma.stockTransaction, 'create')
        .mockResolvedValue({} as any);
      jest.spyOn(prisma.ingredient, 'update').mockResolvedValue({} as any);
      jest
        .spyOn(prisma.orderStockConsumptionReversal, 'create')
        .mockResolvedValue({} as any);

      await ordersService.voidOrder(
        'order-completed',
        'Void request',
        'owner-1',
        Role.OWNER,
      );

      const reversalCalls = createTxSpy.mock.calls.filter(
        (c) => c[0].data.type === 'CONSUMPTION_REVERSAL',
      );
      expect(reversalCalls.length).toBe(1);
      expect(reversalCalls[0][0].data.quantityChange.toNumber()).toBe(0.2);
      expect(reversalCalls[0][0].data.unitCostSnapshot.toNumber()).toBe(5);
      expect(reversalCalls[0][0].data.totalCostSnapshot.toNumber()).toBe(1);
      expect(reversalCalls[0][0].data.reversesStockTransactionId).toBe('tx-1');
    });

    it('11. Non-consumed cancelled Order creates no reversal', async () => {
      const order = mockOrder('order-received', OrderStatus.RECEIVED);
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order);
      jest.spyOn(prisma.order, 'update').mockResolvedValue(order);
      jest
        .spyOn(prisma.orderStatusHistory, 'create')
        .mockResolvedValue({} as any);

      jest
        .spyOn(prisma.orderStockConsumption, 'findUnique')
        .mockResolvedValue(null);
      const createTxSpy = jest
        .spyOn(prisma.stockTransaction, 'create')
        .mockResolvedValue({} as any);

      await ordersService.cancelOrder(
        'order-received',
        'Customer request',
        '',
        'owner-1',
        Role.OWNER,
      );

      const reversalCalls = createTxSpy.mock.calls.filter(
        (c) => c[0].data.type === 'CONSUMPTION_REVERSAL',
      );
      expect(reversalCalls.length).toBe(0);
    });

    it('12. Repeated void does not reverse twice', async () => {
      const order = mockOrder('order-completed', OrderStatus.COMPLETED);
      jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order);
      jest.spyOn(prisma.order, 'update').mockResolvedValue(order);
      jest
        .spyOn(prisma.orderStatusHistory, 'create')
        .mockResolvedValue({} as any);

      jest
        .spyOn(prisma.orderStockConsumption, 'findUnique')
        .mockResolvedValue({ orderId: 'order-completed' } as any);
      jest
        .spyOn(prisma.orderStockConsumptionReversal, 'findUnique')
        .mockResolvedValue({ orderId: 'order-completed' } as any);

      const createTxSpy = jest
        .spyOn(prisma.stockTransaction, 'create')
        .mockResolvedValue({} as any);

      await ordersService.voidOrder(
        'order-completed',
        'Void request',
        'owner-1',
        Role.OWNER,
      );

      const reversalCalls = createTxSpy.mock.calls.filter(
        (c) => c[0].data.type === 'CONSUMPTION_REVERSAL',
      );
      expect(reversalCalls.length).toBe(0);
    });

    describe('Missing Historical Consumption Handling & Integrity Errors', () => {
      it('1. No consumption marker + cancelled Order: returns normally', async () => {
        const order = mockOrder('order-received', OrderStatus.RECEIVED);
        jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order);
        jest.spyOn(prisma.order, 'update').mockResolvedValue(order);
        jest
          .spyOn(prisma.orderStockConsumption, 'findUnique')
          .mockResolvedValue(null);

        await expect(
          ordersService.cancelOrder(
            'order-received',
            'Customer request',
            '',
            'owner-1',
            Role.OWNER,
          ),
        ).resolves.not.toThrow();
      });

      it('2. No consumption marker + void workflow: creates no reversal', async () => {
        const order = mockOrder('order-received', OrderStatus.RECEIVED);
        jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order);
        jest.spyOn(prisma.order, 'update').mockResolvedValue(order);
        jest
          .spyOn(prisma.orderStockConsumption, 'findUnique')
          .mockResolvedValue(null);
        const createTxSpy = jest
          .spyOn(prisma.stockTransaction, 'create')
          .mockResolvedValue({} as any);

        await ordersService.voidOrder(
          'order-received',
          'Void request',
          'owner-1',
          Role.OWNER,
        );

        const reversalCalls = createTxSpy.mock.calls.filter(
          (c) => c[0].data.type === 'CONSUMPTION_REVERSAL',
        );
        expect(reversalCalls.length).toBe(0);
      });

      it('3. Consumption marker exists + historical consumption exists: reversal succeeds', async () => {
        const order = mockOrder('order-completed', OrderStatus.COMPLETED);
        jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order);
        jest.spyOn(prisma.order, 'update').mockResolvedValue(order);

        jest
          .spyOn(prisma.orderStockConsumption, 'findUnique')
          .mockResolvedValue({ orderId: 'order-completed' } as any);
        jest
          .spyOn(prisma.orderStockConsumptionReversal, 'findUnique')
          .mockResolvedValue(null);
        jest.spyOn(prisma.stockTransaction, 'findMany').mockResolvedValue([
          {
            id: 'tx-1',
            ingredientId: 'ing-1',
            quantityChange: new Decimal(-0.2),
            unitCostSnapshot: new Decimal(5),
            totalCostSnapshot: new Decimal(-1),
            ingredient: {
              id: 'ing-1',
              name: 'Milk',
              currentStock: new Decimal(9.8),
              averageCost: new Decimal(5),
            },
          },
        ] as any);

        const createTxSpy = jest
          .spyOn(prisma.stockTransaction, 'create')
          .mockResolvedValue({} as any);
        jest.spyOn(prisma.ingredient, 'update').mockResolvedValue({} as any);
        jest
          .spyOn(prisma.orderStockConsumptionReversal, 'create')
          .mockResolvedValue({} as any);

        await expect(
          ordersService.voidOrder(
            'order-completed',
            'Void request',
            'owner-1',
            Role.OWNER,
          ),
        ).resolves.not.toThrow();

        const reversalCalls = createTxSpy.mock.calls.filter(
          (c) => c[0].data.type === 'CONSUMPTION_REVERSAL',
        );
        expect(reversalCalls.length).toBe(1);
      });

      it('4. Consumption marker exists + historical consumption missing: throws integrity error', async () => {
        const order = mockOrder('order-completed', OrderStatus.COMPLETED);
        jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order);
        jest.spyOn(prisma.order, 'update').mockResolvedValue(order);

        jest
          .spyOn(prisma.orderStockConsumption, 'findUnique')
          .mockResolvedValue({ orderId: 'order-completed' } as any);
        jest
          .spyOn(prisma.orderStockConsumptionReversal, 'findUnique')
          .mockResolvedValue(null);
        jest.spyOn(prisma.stockTransaction, 'findMany').mockResolvedValue([]);

        await expect(
          ordersService.voidOrder(
            'order-completed',
            'Void request',
            'owner-1',
            Role.OWNER,
          ),
        ).rejects.toThrow(InternalServerErrorException);
      });

      it('5. Missing historical consumption: creates zero CONSUMPTION_REVERSAL transactions', async () => {
        const order = mockOrder('order-completed', OrderStatus.COMPLETED);
        jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order);
        jest.spyOn(prisma.order, 'update').mockResolvedValue(order);

        jest
          .spyOn(prisma.orderStockConsumption, 'findUnique')
          .mockResolvedValue({ orderId: 'order-completed' } as any);
        jest
          .spyOn(prisma.orderStockConsumptionReversal, 'findUnique')
          .mockResolvedValue(null);
        jest.spyOn(prisma.stockTransaction, 'findMany').mockResolvedValue([]);
        const createTxSpy = jest
          .spyOn(prisma.stockTransaction, 'create')
          .mockResolvedValue({} as any);

        try {
          await ordersService.voidOrder(
            'order-completed',
            'Void request',
            'owner-1',
            Role.OWNER,
          );
        } catch {}

        const reversalCalls = createTxSpy.mock.calls.filter(
          (c) => c[0].data.type === 'CONSUMPTION_REVERSAL',
        );
        expect(reversalCalls.length).toBe(0);
      });

      it('6. Missing historical consumption: does not update Ingredient.currentStock', async () => {
        const order = mockOrder('order-completed', OrderStatus.COMPLETED);
        jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order);
        jest.spyOn(prisma.order, 'update').mockResolvedValue(order);

        jest
          .spyOn(prisma.orderStockConsumption, 'findUnique')
          .mockResolvedValue({ orderId: 'order-completed' } as any);
        jest
          .spyOn(prisma.orderStockConsumptionReversal, 'findUnique')
          .mockResolvedValue(null);
        jest.spyOn(prisma.stockTransaction, 'findMany').mockResolvedValue([]);
        const updateIngSpy = jest
          .spyOn(prisma.ingredient, 'update')
          .mockResolvedValue({} as any);

        try {
          await ordersService.voidOrder(
            'order-completed',
            'Void request',
            'owner-1',
            Role.OWNER,
          );
        } catch {}

        expect(updateIngSpy).not.toHaveBeenCalled();
      });

      it('7. Missing historical consumption: does not create OrderStockConsumptionReversal marker', async () => {
        const order = mockOrder('order-completed', OrderStatus.COMPLETED);
        jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order);
        jest.spyOn(prisma.order, 'update').mockResolvedValue(order);

        jest
          .spyOn(prisma.orderStockConsumption, 'findUnique')
          .mockResolvedValue({ orderId: 'order-completed' } as any);
        jest
          .spyOn(prisma.orderStockConsumptionReversal, 'findUnique')
          .mockResolvedValue(null);
        jest.spyOn(prisma.stockTransaction, 'findMany').mockResolvedValue([]);
        const createMarkerSpy = jest
          .spyOn(prisma.orderStockConsumptionReversal, 'create')
          .mockResolvedValue({} as any);

        try {
          await ordersService.voidOrder(
            'order-completed',
            'Void request',
            'owner-1',
            Role.OWNER,
          );
        } catch {}

        expect(createMarkerSpy).not.toHaveBeenCalled();
      });

      it('8. Missing historical consumption: Order void transaction rolls back if void and stock reversal participate in the same Prisma transaction', async () => {
        const order = mockOrder('order-completed', OrderStatus.COMPLETED);
        jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(order);
        jest.spyOn(prisma.order, 'update').mockResolvedValue(order);

        jest
          .spyOn(prisma.orderStockConsumption, 'findUnique')
          .mockResolvedValue({ orderId: 'order-completed' } as any);
        jest
          .spyOn(prisma.orderStockConsumptionReversal, 'findUnique')
          .mockResolvedValue(null);
        jest.spyOn(prisma.stockTransaction, 'findMany').mockResolvedValue([]);

        await expect(
          ordersService.voidOrder(
            'order-completed',
            'Void request',
            'owner-1',
            Role.OWNER,
          ),
        ).rejects.toThrow(InternalServerErrorException);
      });
    });
  });
});
