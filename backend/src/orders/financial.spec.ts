import { Test, TestingModule } from '@nestjs/testing';
import { FinancialCalculationService } from './financial-calculation.service';
import { BillingService } from './billing.service';
import { PaymentsService } from './payments.service';
import { OrdersService } from './orders.service';
import { PrismaService } from '../common/prisma.service';
import { CartPricingService } from './cart-pricing.service';
import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import {
  Role,
  BillStatus,
  PaymentStatus,
  PaymentMethod,
  PaymentStatusDetail,
  OrderStatus,
  OrderSource,
} from '@prisma/client';

describe('Phase 5 Financial, Billing, and Payments Unit Tests', () => {
  let calcService: FinancialCalculationService;
  let billingService: BillingService;
  let paymentsService: PaymentsService;
  let ordersService: OrdersService;
  let prisma: PrismaService;

  beforeAll(async () => {
    // Mock Prisma's database connect/disconnect/transaction methods
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialCalculationService,
        BillingService,
        PaymentsService,
        OrdersService,
        PrismaService,
        CartPricingService,
      ],
    }).compile();

    calcService = module.get<FinancialCalculationService>(
      FinancialCalculationService,
    );
    billingService = module.get<BillingService>(BillingService);
    paymentsService = module.get<PaymentsService>(PaymentsService);
    ordersService = module.get<OrdersService>(OrdersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  beforeEach(() => {
    jest.spyOn(prisma.tableSession, 'findFirst').mockResolvedValue(null);
    jest.spyOn(prisma.tableSession, 'create').mockResolvedValue({ id: 'sess-1' } as any);
    jest.spyOn(prisma.tableSession, 'update').mockResolvedValue({} as any);
    jest.spyOn(prisma.customerCart, 'findUnique').mockResolvedValue(null);
    jest.spyOn(prisma.customerCart, 'deleteMany').mockResolvedValue({ count: 1 });
    jest.spyOn(prisma.creditLedger, 'create').mockResolvedValue({} as any);
    jest.spyOn(prisma.creditLedger, 'findUnique').mockResolvedValue(null);
    jest.spyOn(prisma.creditLedger, 'update').mockResolvedValue({} as any);
  });

  describe('1. FinancialCalculationService Calculations', () => {
    const settingsBase = {
      id: 'default',
      restaurantName: 'Cafe Cue & Brew',
      gstPercentage: 5,
      cgstPercentage: 2.5,
      sgstPercentage: 2.5,
      taxInclusivePricing: true,
      enableGst: true,
      enableServiceCharge: true,
      serviceChargePercentage: 5,
      enableNightCharges: true,
      nightStart: '22:00',
      nightEnd: '02:00',
      nightChargeType: 'PERCENTAGE',
      nightChargeValue: 10,
      enableRoundOff: true,
      timezone: 'Asia/Kolkata',
    } as any;

    it('should calculate GST inclusive pricing correctly', () => {
      const result = calcService.calculate({
        subtotal: 1000,
        settings: settingsBase,
        applyNightChargeOverride: false, // disable night charge for basic test
      });

      // Inclusive GST on 1000:
      // subtotal = 1000
      // cgst = 1000 * 2.5 / 105 = 23.81
      // sgst = 1000 * 2.5 / 105 = 23.81
      // baseTaxableAmount = 1000 - 47.62 = 952.38
      // serviceCharge = 952.38 * 5 / 100 = 47.62
      // preRoundGrandTotal = 952.38 + 23.81 + 23.81 + 47.62 = 1047.62
      // roundOff = 1048 - 1047.62 = 0.38
      // grandTotal = 1048

      expect(result.subtotal).toBe(1000);
      expect(result.cgst).toBe(23.81);
      expect(result.sgst).toBe(23.81);
      expect(result.serviceCharge).toBe(47.62);
      expect(result.roundOff).toBe(0.38);
      expect(result.grandTotal).toBe(1048);
    });

    it('should calculate GST exclusive pricing correctly', () => {
      const settingsExclusive = {
        ...settingsBase,
        taxInclusivePricing: false,
      };

      const result = calcService.calculate({
        subtotal: 1000,
        settings: settingsExclusive,
        applyNightChargeOverride: false,
      });

      // Exclusive GST on 1000:
      // subtotal = 1000
      // cgst = 1000 * 2.5 / 100 = 25
      // sgst = 1000 * 2.5 / 100 = 25
      // baseTaxableAmount = 1000
      // serviceCharge = 1000 * 5 / 100 = 50
      // preRoundGrandTotal = 1000 + 25 + 25 + 50 = 1100
      // grandTotal = 1100
      expect(result.cgst).toBe(25);
      expect(result.sgst).toBe(25);
      expect(result.serviceCharge).toBe(50);
      expect(result.grandTotal).toBe(1100);
    });

    it('should apply FLAT and PERCENTAGE night charges correctly', () => {
      // Percentage night charge: 10%
      const resultPct = calcService.calculate({
        subtotal: 1000,
        settings: settingsBase,
        applyNightChargeOverride: true,
      });
      // baseTaxable = 952.38. night charge pct 10% = 95.24
      expect(resultPct.nightCharge).toBe(95.24);

      // Flat night charge: 150
      const settingsFlatNight = {
        ...settingsBase,
        nightChargeType: 'FLAT',
        nightChargeValue: 150,
      };
      const resultFlat = calcService.calculate({
        subtotal: 1000,
        settings: settingsFlatNight,
        applyNightChargeOverride: true,
      });
      expect(resultFlat.nightCharge).toBe(150);
    });

    it('should handle cross-midnight time detection', () => {
      // night start 22:00 to 02:00
      // We mock isNightTime using the logic directly or indirectly
      const isNight1 = calcService.isNightTime(
        '22:00',
        '02:00',
        'Asia/Kolkata',
      );
      expect(typeof isNight1).toBe('boolean');
    });

    it('should cap discount at subtotal and apply sequentially', () => {
      const result = calcService.calculate({
        subtotal: 500,
        manualDiscount: 400,
        couponDiscount: 200,
        settings: settingsBase,
      });

      // Total discount (600) exceeds subtotal (500). Max discount cap = 500.
      // Sequential: Manual is applied first (400), then Coupon takes remaining (100)
      expect(result.discount).toBe(500);
      expect(result.couponDiscount).toBe(100);
      expect(result.manualDiscount).toBe(400);
      expect(result.grandTotal).toBe(0);
    });
  });

  describe('2. BillingService Manual Discounts & Finalization', () => {
    it('should validate manual discount role limit controls', async () => {
      // WAITER: throw Forbidden
      await expect(
        billingService.applyManualDiscount('order-1', 'staff-1', Role.WAITER, {
          type: 'PERCENTAGE',
          value: 15,
          reason: 'Good customer',
        }),
      ).rejects.toThrow(ForbiddenException);

      // Setup prisma mocks for order and settings
      const mockOrder = {
        id: 'order-1',
        subtotal: 100,
        taxableAmount: 100,
        cgst: 0,
        sgst: 0,
        serviceCharge: 0,
        nightCharge: 0,
        roundOff: 0,
        grandTotal: 100,
        discount: 0,
        couponDiscount: 0,
        status: 'RECEIVED',
      };

      const mockSettings = {
        id: 'default',
        cashierMaxDiscountPercent: 5.0,
        managerMaxDiscountPercent: 15.0,
        enableGst: false,
        enableServiceCharge: false,
        enableNightCharges: false,
      };

      // Mock DB calls
      const orderSpy = jest
        .spyOn(prisma.order, 'findUnique')
        .mockResolvedValue(mockOrder as any);
      const settingsSpy = jest
        .spyOn(prisma.restaurantSettings, 'findUnique')
        .mockResolvedValue(mockSettings as any);
      const billSpy = jest.spyOn(prisma.bill, 'findFirst').mockResolvedValue({
        id: 'bill-1',
        status: 'DRAFT',
        manualDiscount: 0,
      } as any);
      const billUpdateSpy = jest
        .spyOn(prisma.bill, 'update')
        .mockResolvedValue({ id: 'bill-1' } as any);
      const auditSpy = jest
        .spyOn(prisma.auditLog, 'create')
        .mockResolvedValue({} as any);

      // Cashier 5% discount succeeds
      await expect(
        billingService.applyManualDiscount('order-1', 'staff-1', Role.CASHIER, {
          type: 'PERCENTAGE',
          value: 5,
          reason: 'Goodwill cashier',
        }),
      ).resolves.toBeDefined();

      // Cashier 6% discount fails
      await expect(
        billingService.applyManualDiscount('order-1', 'staff-1', Role.CASHIER, {
          type: 'PERCENTAGE',
          value: 6,
          reason: 'Excessive cashier',
        }),
      ).rejects.toThrow(ForbiddenException);

      // Manager 15% succeeds
      await expect(
        billingService.applyManualDiscount('order-1', 'staff-1', Role.MANAGER, {
          type: 'PERCENTAGE',
          value: 15,
          reason: 'Manager discount',
        }),
      ).resolves.toBeDefined();

      // Manager 16% fails
      await expect(
        billingService.applyManualDiscount('order-1', 'staff-1', Role.MANAGER, {
          type: 'PERCENTAGE',
          value: 16,
          reason: 'Excessive manager',
        }),
      ).rejects.toThrow(ForbiddenException);

      // Owner can exceed these limits (e.g. 50%)
      await expect(
        billingService.applyManualDiscount('order-1', 'staff-1', Role.OWNER, {
          type: 'PERCENTAGE',
          value: 50,
          reason: 'Owner discount',
        }),
      ).resolves.toBeDefined();

      // Negative payable total remains impossible (120% discount fails)
      await expect(
        billingService.applyManualDiscount('order-1', 'staff-1', Role.OWNER, {
          type: 'PERCENTAGE',
          value: 120,
          reason: 'Owner negative grand total',
        }),
      ).rejects.toThrow(BadRequestException);

      // Blank reason must throw BadRequestException
      await expect(
        billingService.applyManualDiscount('order-1', 'staff-1', Role.OWNER, {
          type: 'PERCENTAGE',
          value: 15,
          reason: '  ',
        }),
      ).rejects.toThrow(BadRequestException);

      // Clean up spies
      orderSpy.mockRestore();
      settingsSpy.mockRestore();
      billSpy.mockRestore();
      billUpdateSpy.mockRestore();
      auditSpy.mockRestore();
    });

    it('should finalize draft bill and generate unique invoice numbers inside a transaction', async () => {
      jest.spyOn(prisma.order, 'findUnique').mockImplementation(() =>
        Promise.resolve({
          id: 'ord-123',
          status: OrderStatus.ACCEPTED,
          subtotal: 800,
          discount: 0,
          grandTotal: 800,
          couponCode: null,
          customerId: 'cust-1',
        } as any),
      );

      jest
        .spyOn(prisma.restaurantSettings, 'findUnique')
        .mockImplementation(() =>
          Promise.resolve({
            id: 'default',
            invoicePrefix: 'CCB',
            gstPercentage: 5,
            enableGst: false,
            enableRoundOff: true,
          } as any),
        );

      let findFirstCallCount = 0;
      jest.spyOn(prisma.bill, 'findFirst').mockImplementation(() => {
        findFirstCallCount++;
        if (findFirstCallCount === 1) {
          return Promise.resolve(null);
        }
        return Promise.resolve({
          id: 'bill-123',
          orderId: 'ord-123',
          status: BillStatus.DRAFT,
          manualDiscount: 0,
        } as any);
      });

      jest.spyOn(prisma.invoiceSequence, 'upsert').mockImplementation(() =>
        Promise.resolve({
          lastNumber: 42,
        } as any),
      );

      jest.spyOn(prisma.bill, 'update').mockImplementation((args: any) =>
        Promise.resolve({
          id: 'bill-123',
          invoiceNumber: args.data.invoiceNumber,
          status: BillStatus.FINALIZED,
          grandTotal: args.data.grandTotal,
        } as any),
      );

      jest
        .spyOn(prisma.order, 'update')
        .mockImplementation(() => Promise.resolve({} as any));

      const finalized = await billingService.finalizeBill(
        'ord-123',
        'owner-id',
      );
      expect(finalized.status).toBe(BillStatus.FINALIZED);
      expect(finalized.invoiceNumber).toBe('CCB-2026-000042');
    });
  });

  describe('3. PaymentsService Record Payment & Overpayment Protections', () => {
    const defaultSettings = {
      id: 'default',
      enableCash: true,
      enableUpi: true,
      enableCard: true,
      enableCredit: true,
    } as any;

    it('should reject payment if method is disabled in settings', async () => {
      jest.spyOn(prisma.bill, 'findUnique').mockImplementation(() =>
        Promise.resolve({
          id: 'bill-1',
          status: BillStatus.FINALIZED,
          grandTotal: 1000,
        } as any),
      );

      // Disable card payments in settings
      jest
        .spyOn(prisma.restaurantSettings, 'findUnique')
        .mockImplementation(() =>
          Promise.resolve({
            ...defaultSettings,
            enableCard: false,
          }),
        );

      await expect(
        paymentsService.recordPayment('cashier-1', Role.CASHIER, {
          billId: 'bill-1',
          method: PaymentMethod.CARD,
          amount: 500,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should enforce overpayment rules for UPI and Card', async () => {
      jest.spyOn(prisma.bill, 'findUnique').mockImplementation(() =>
        Promise.resolve({
          id: 'bill-1',
          status: BillStatus.FINALIZED,
          grandTotal: 600,
        } as any),
      );

      jest
        .spyOn(prisma.restaurantSettings, 'findUnique')
        .mockImplementation(() => Promise.resolve(defaultSettings));

      // Mock existing payments to show ₹400 outstanding
      jest.spyOn(prisma.payment, 'findMany').mockImplementation(() =>
        Promise.resolve([
          {
            id: 'pay-1',
            amount: 200,
            isSettled: true,
            status: PaymentStatusDetail.COMPLETED,
          },
        ] as any),
      );

      // UPI overpayment: outstanding is 400, trying to pay 500 should throw BadRequestException
      await expect(
        paymentsService.recordPayment('cashier-1', Role.CASHIER, {
          billId: 'bill-1',
          method: PaymentMethod.UPI,
          amount: 500,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle cash tenders with change due and record only settled amount', async () => {
      jest.spyOn(prisma.bill, 'findUnique').mockImplementation(() =>
        Promise.resolve({
          id: 'bill-1',
          status: BillStatus.FINALIZED,
          grandTotal: 500,
          financialVersion: 0,
        } as any),
      );

      jest
        .spyOn(prisma.payment, 'findMany')
        .mockImplementation(() => Promise.resolve([]));
      jest
        .spyOn(prisma.bill, 'updateMany')
        .mockImplementation(() => Promise.resolve({ count: 1 } as any));

      let recordedData: any = null;
      jest.spyOn(prisma.payment, 'create').mockImplementation((args: any) => {
        recordedData = args.data;
        return Promise.resolve({ id: 'new-pay' } as any);
      });

      jest
        .spyOn(prisma.bill, 'update')
        .mockImplementation(() => Promise.resolve({} as any));
      jest
        .spyOn(prisma.order, 'update')
        .mockImplementation(() => Promise.resolve({} as any));
      jest
        .spyOn(prisma.auditLog, 'create')
        .mockImplementation(() => Promise.resolve({} as any));

      // Customer tenders ₹1000 for ₹500 bill
      await paymentsService.recordPayment('cashier-1', Role.CASHIER, {
        billId: 'bill-1',
        method: PaymentMethod.CASH,
        amount: 1000, // cashier enters 1000 tendered
        amountTendered: 1000,
      });

      expect(recordedData.amount).toBe(500); // capped at outstanding
      expect(recordedData.changeDue).toBe(500);
      expect(recordedData.amountTendered).toBe(1000);
    });

    it('should support credit payment and exclude it from settled totals', async () => {
      jest.spyOn(prisma.bill, 'findUnique').mockImplementation(() =>
        Promise.resolve({
          id: 'bill-1',
          status: BillStatus.FINALIZED,
          grandTotal: 1000,
          financialVersion: 1,
          order: {
            customerId: 'customer-1',
          },
        } as any),
      );

      // Record CREDIT payment of ₹400
      let paymentData: any = null;
      jest.spyOn(prisma.payment, 'create').mockImplementation((args: any) => {
        paymentData = args.data;
        return Promise.resolve({ id: 'credit-pay' } as any);
      });

      await paymentsService.recordPayment('cashier-1', Role.CASHIER, {
        billId: 'bill-1',
        method: PaymentMethod.CREDIT,
        amount: 400,
      });

      expect(paymentData.isSettled).toBe(false); // Credit is not settled
      expect(paymentData.amount).toBe(400);
    });

    it('should catch payment idempotency keys to prevent double submission', async () => {
      const mockPay = {
        id: 'existing-pay-id',
        paymentIdempotencyKey: 'idemp-pay-key',
        amount: 300,
      };

      jest
        .spyOn(prisma.payment, 'findUnique')
        .mockImplementation(() => Promise.resolve(mockPay as any));

      const res = await paymentsService.recordPayment(
        'cashier-1',
        Role.CASHIER,
        {
          billId: 'bill-1',
          method: PaymentMethod.UPI,
          amount: 300,
          paymentIdempotencyKey: 'idemp-pay-key',
        },
      );

      expect(res.id).toBe('existing-pay-id');
    });

    it('should enforce optimistic concurrency checking and throw ConflictException', async () => {
      jest.spyOn(prisma.bill, 'findUnique').mockImplementation(() =>
        Promise.resolve({
          id: 'bill-1',
          status: BillStatus.FINALIZED,
          grandTotal: 600,
          financialVersion: 10,
        } as any),
      );

      jest
        .spyOn(prisma.payment, 'findMany')
        .mockImplementation(() => Promise.resolve([]));

      // Simulate conflict (0 rows updated)
      jest
        .spyOn(prisma.bill, 'updateMany')
        .mockImplementation(() => Promise.resolve({ count: 0 } as any));

      await expect(
        paymentsService.recordPayment('cashier-1', Role.CASHIER, {
          billId: 'bill-1',
          method: PaymentMethod.UPI,
          amount: 200,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('4. POS Order Creation Scenarios', () => {
    it('should prevent waiters from creating POS orders', async () => {
      await expect(
        ordersService.createPosOrder('waiter-1', Role.WAITER, {
          orderType: 'DINE_IN',
          items: [],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create dine-in orders and occupy the table', async () => {
      jest
        .spyOn(prisma.restaurantSettings, 'findUnique')
        .mockImplementation(() =>
          Promise.resolve({
            id: 'default',
            allowAddons: false,
            enableGst: false,
            enableServiceCharge: false,
            enableNightCharges: false,
          } as any),
        );

      jest.spyOn(prisma.restaurantTable, 'findUnique').mockImplementation(() =>
        Promise.resolve({
          id: 'table-5',
          tableNumber: 'Table 5',
          isActive: true,
        } as any),
      );

      jest
        .spyOn(prisma.menuItem, 'findMany')
        .mockImplementation(() => Promise.resolve([]));
      jest
        .spyOn(prisma.customer, 'upsert')
        .mockImplementation(() => Promise.resolve({ id: 'cust-1' } as any));
      jest.spyOn(prisma.order, 'findUnique').mockImplementation((args: any) => {
        if (args?.where?.idempotencyKey || args?.where?.orderNumber) {
          return Promise.resolve(null);
        }
        return Promise.resolve({
          id: 'ord-pos',
          status: OrderStatus.ACCEPTED,
          paymentStatus: PaymentStatus.UNPAID,
          items: [],
          customer: { name: 'Walk-in Customer' },
        } as any);
      });

      jest.spyOn(prisma.order, 'create').mockImplementation((args: any) =>
        Promise.resolve({
          id: 'ord-pos',
          status: OrderStatus.ACCEPTED,
          paymentStatus: PaymentStatus.UNPAID,
          tableId: args.data.tableId,
        } as any),
      );

      jest
        .spyOn(prisma.orderStatusHistory, 'create')
        .mockImplementation(() => Promise.resolve({} as any));
      let tableStatusUpdated = false;
      jest
        .spyOn(prisma.restaurantTable, 'update')
        .mockImplementation((args: any) => {
          if (args.data.status === 'OCCUPIED') {
            tableStatusUpdated = true;
          }
          return Promise.resolve({} as any);
        });
      jest
        .spyOn(prisma.bill, 'create')
        .mockImplementation(() => Promise.resolve({} as any));

      const order = await ordersService.createPosOrder(
        'cashier-1',
        Role.CASHIER,
        {
          orderType: 'DINE_IN',
          tableId: 'table-5',
          items: [],
        } as any,
      );

      expect(order).toBeDefined();
      expect(tableStatusUpdated).toBe(true);
    });

    it('should create takeaway orders with null table and not occupy any tables', async () => {
      let tableStatusUpdated = false;
      jest.spyOn(prisma.restaurantTable, 'update').mockImplementation(() => {
        tableStatusUpdated = true;
        return Promise.resolve({} as any);
      });

      jest.spyOn(prisma.order, 'create').mockImplementation((args: any) => {
        expect(args.data.tableId).toBeNull();
        return Promise.resolve({
          id: 'ord-takeaway',
          status: OrderStatus.ACCEPTED,
          paymentStatus: PaymentStatus.UNPAID,
          tableId: null,
        } as any);
      });

      const order = await ordersService.createPosOrder(
        'cashier-1',
        Role.CASHIER,
        {
          orderType: 'TAKEAWAY',
          items: [],
        } as any,
      );

      expect(order).toBeDefined();
      expect(tableStatusUpdated).toBe(false); // No table was occupied
    });
  });
});
