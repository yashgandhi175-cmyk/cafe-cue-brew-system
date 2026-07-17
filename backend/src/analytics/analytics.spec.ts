import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../common/prisma.service';
import { BillStatus, PaymentMethod } from '@prisma/client';

describe('AnalyticsService Financial Status Audit Tests', () => {
  let service: AnalyticsService;
  let prisma: PrismaService;

  const mockBills = [
    {
      id: 'bill-finalized',
      invoiceNumber: 'INV-001',
      status: BillStatus.FINALIZED,
      subtotal: 450,
      discount: 50,
      cgst: 12.5,
      sgst: 12.5,
      serviceCharge: 25,
      nightCharge: 0,
      grandTotal: 500,
      finalizedAt: new Date(),
      createdAt: new Date(),
    },
    {
      id: 'bill-paid',
      invoiceNumber: 'INV-002',
      status: BillStatus.PAID,
      subtotal: 720,
      discount: 80,
      cgst: 20,
      sgst: 20,
      serviceCharge: 40,
      nightCharge: 0,
      grandTotal: 800,
      finalizedAt: new Date(),
      createdAt: new Date(),
    },
    {
      id: 'bill-voided',
      invoiceNumber: 'INV-003',
      status: BillStatus.VOIDED,
      subtotal: 900,
      discount: 100,
      cgst: 25,
      sgst: 25,
      serviceCharge: 50,
      nightCharge: 0,
      grandTotal: 1000,
      finalizedAt: new Date(),
      createdAt: new Date(),
    },
    {
      id: 'bill-draft',
      invoiceNumber: null,
      status: BillStatus.DRAFT,
      subtotal: 270,
      discount: 30,
      cgst: 7.5,
      sgst: 7.5,
      serviceCharge: 15,
      nightCharge: 0,
      grandTotal: 300,
      finalizedAt: null,
      createdAt: new Date(),
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: PrismaService,
          useValue: {
            bill: {
              aggregate: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
              groupBy: jest.fn(),
            },
            payment: {
              aggregate: jest.fn(),
              groupBy: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
            },
            order: {
              count: jest.fn(),
              findMany: jest.fn(),
            },
            restaurantSettings: {
              findUnique: jest.fn(),
            },
            couponUsage: {
              aggregate: jest.fn(),
              count: jest.fn(),
              groupBy: jest.fn(),
              findMany: jest.fn(),
            },
            coupon: {
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    prisma = module.get<PrismaService>(PrismaService);

    // Default mock returns to prevent undefined errors
    jest.spyOn(prisma.bill, 'findMany').mockResolvedValue([]);
  });

  it('should include FINALIZED and PAID bills, and exclude DRAFT and VOIDED bills', async () => {
    // 1. Mock DB aggregations using only eligible bills (FINALIZED and PAID)
    const eligibleBills = mockBills.filter(
      (b) => b.status === BillStatus.FINALIZED || b.status === BillStatus.PAID,
    );

    const mockSum = eligibleBills.reduce(
      (acc, b) => {
        acc.grandTotal += b.grandTotal;
        acc.discount += b.discount;
        acc.cgst += b.cgst;
        acc.sgst += b.sgst;
        acc.serviceCharge += b.serviceCharge;
        acc.nightCharge += b.nightCharge;
        return acc;
      },
      {
        grandTotal: 0,
        discount: 0,
        cgst: 0,
        sgst: 0,
        serviceCharge: 0,
        nightCharge: 0,
      },
    );

    jest.spyOn(prisma.bill, 'aggregate').mockResolvedValue({
      _sum: mockSum,
      _count: { id: eligibleBills.length },
    } as any);

    jest.spyOn(prisma.payment, 'aggregate').mockResolvedValue({
      _sum: { amount: 800 },
    } as any);

    jest
      .spyOn(prisma.payment, 'groupBy')
      .mockResolvedValue([
        { method: PaymentMethod.CASH, _sum: { amount: 800 } },
      ] as any);

    jest.spyOn(prisma.order, 'count').mockResolvedValue(2);

    const result = await service.getOverview('TODAY');

    // Expected Billed Sales: 500 + 800 = 1300
    expect(result.billedSales).toBe(1300);
    // Verify AOV includes PAID bills (1300 / 2 bills = 650)
    expect(result.averageOrderValue).toBe(650);
    // Verify GST collected includes PAID bills (cgst 32.5 + sgst 32.5 = 65)
    expect(result.gstCollected).toBe(65);
    // Verify Discounts includes PAID bills (50 + 80 = 130)
    expect(result.discountsGiven).toBe(130);

    // Verify aggregate query structure used the shared eligible statuses
    expect(prisma.bill.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: [BillStatus.FINALIZED, BillStatus.PAID] },
        }),
      }),
    );
  });

  it('should verify PAID bills remain in Daily Sales Report', async () => {
    const eligibleBills = mockBills.filter(
      (b) => b.status === BillStatus.FINALIZED || b.status === BillStatus.PAID,
    );
    jest.spyOn(prisma.bill, 'findMany').mockResolvedValue(eligibleBills as any);
    jest.spyOn(prisma.payment, 'findMany').mockResolvedValue([]);

    const result = await service.getDailySalesReport('TODAY');

    // Check that we have dates returning and the total sales matches the sum of finalized and paid
    const rows = Array.isArray(result) ? result : (result as any).items;
    expect(rows.length).toBeGreaterThan(0);
    const totalBilled = rows.reduce(
      (sum: number, r: any) => sum + r.billedSales,
      0,
    );
    expect(totalBilled).toBe(1300);
  });

  it('should verify PAID bills remain in GST Report', async () => {
    const eligibleBills = mockBills.filter(
      (b) => b.status === BillStatus.FINALIZED || b.status === BillStatus.PAID,
    );
    jest.spyOn(prisma.bill, 'count').mockResolvedValue(eligibleBills.length);
    jest.spyOn(prisma.bill, 'findMany').mockResolvedValue(eligibleBills as any);

    const result = await service.getGSTReport(
      'TODAY',
      undefined,
      undefined,
      1,
      10,
    );

    expect(result.total).toBe(2);
    expect(result.items.some((i: any) => i.invoiceNumber === 'INV-002')).toBe(
      true,
    ); // INV-002 is PAID
  });

  describe('Coupon Usage Trend Analytics', () => {
    it('should calculate coupon analytics with usage trend correctly', async () => {
      // Mock aggregations
      jest.spyOn(prisma.couponUsage, 'aggregate').mockResolvedValue({
        _sum: { appliedDiscountSnapshot: 150 },
        _count: { id: 3 },
      } as any);

      jest
        .spyOn(prisma.couponUsage, 'count')
        .mockImplementation(async (args: any) => {
          if (args?.where?.status === 'ACTIVE') return 2;
          if (args?.where?.status === 'REVERSED') return 1;
          return 0;
        });

      jest
        .spyOn(prisma.couponUsage, 'groupBy')
        .mockImplementation(async (args: any) => {
          if (args?.by?.includes('customerId')) {
            return [{ customerId: 'cust-1', _count: { id: 2 } }];
          }
          if (args?.by?.includes('couponId')) {
            return [
              {
                couponId: 'coupon-1',
                _count: { id: 2 },
                _sum: { appliedDiscountSnapshot: 100 },
              },
              {
                couponId: 'coupon-2',
                _count: { id: 1 },
                _sum: { appliedDiscountSnapshot: 50 },
              },
            ];
          }
          return [];
        });

      jest.spyOn(prisma.coupon, 'findMany').mockResolvedValue([
        {
          id: 'coupon-1',
          code: 'PROMO10',
          name: 'Promo 10',
          usedCount: 2,
          usageLimit: 10,
        },
        {
          id: 'coupon-2',
          code: 'PROMO20',
          name: 'Promo 20',
          usedCount: 1,
          usageLimit: 5,
        },
      ] as any);

      const now = new Date('2026-07-15T12:00:00.000Z');
      const usages = [
        {
          createdAt: now,
          status: 'ACTIVE',
          appliedDiscountSnapshot: 100,
        },
        {
          createdAt: now,
          status: 'ACTIVE',
          appliedDiscountSnapshot: 50,
        },
        {
          createdAt: now,
          status: 'REVERSED',
          appliedDiscountSnapshot: 80,
        },
      ];

      jest
        .spyOn(prisma.couponUsage, 'findMany')
        .mockResolvedValue(usages as any);

      const result = await service.getCouponAnalytics('LAST_30_DAYS');

      expect(result.totalDiscount).toBe(150);
      expect(result.redemptions).toBe(3);
      expect(result.activeCount).toBe(2);
      expect(result.reversedCount).toBe(1);

      // Verify usageTrend
      expect(result.usageTrend).toBeDefined();
      expect(result.usageTrend.length).toBe(1);
      const dayTrend = result.usageTrend[0];
      expect(dayTrend.redemptions).toBe(3);
      expect(dayTrend.activeUsages).toBe(2);
      expect(dayTrend.reversedUsages).toBe(1);
      expect(dayTrend.totalDiscount).toBe(150); // 100 + 50 active usages
    });
  });

  describe('Coupon Usage Report Pagination', () => {
    it('should safely clamp page and limit values', async () => {
      const mockFindMany = jest
        .spyOn(prisma.couponUsage, 'findMany')
        .mockResolvedValue([]);
      jest.spyOn(prisma.couponUsage, 'count').mockResolvedValue(0);

      // limit = 1 accepted
      let res = await service.getCouponUsageReport(
        'TODAY',
        undefined,
        undefined,
        1,
        1,
      );
      expect(res.limit).toBe(1);
      expect(mockFindMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 1 }),
      );

      // limit = 100 accepted
      res = await service.getCouponUsageReport(
        'TODAY',
        undefined,
        undefined,
        1,
        100,
      );
      expect(res.limit).toBe(100);
      expect(mockFindMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 100 }),
      );

      // limit = 101 cannot cause take > 100
      res = await service.getCouponUsageReport(
        'TODAY',
        undefined,
        undefined,
        1,
        101,
      );
      expect(res.limit).toBe(100);
      expect(mockFindMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 100 }),
      );

      // negative limit normalized to 20
      res = await service.getCouponUsageReport(
        'TODAY',
        undefined,
        undefined,
        1,
        -5,
      );
      expect(res.limit).toBe(20);
      expect(mockFindMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 20 }),
      );

      // page < 1 normalized to 1
      res = await service.getCouponUsageReport(
        'TODAY',
        undefined,
        undefined,
        -2,
        10,
      );
      expect(res.page).toBe(1);
      expect(mockFindMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });
  });
});
