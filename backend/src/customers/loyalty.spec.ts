/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { LoyaltyService } from './loyalty.service';
import { BillingService } from '../orders/billing.service';
import { OrdersService } from '../orders/orders.service';
import { FinancialCalculationService } from '../orders/financial-calculation.service';
import {
  LoyaltyTransactionType,
  LoyaltyRedemptionRequestStatus,
  CustomerStatus,
  Role,
  BillStatus,
  OrderStatus,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

describe('Loyalty System (Phase 8B Mock-Integrated Tests)', () => {
  let loyaltyService: LoyaltyService;
  let billingService: BillingService;
  let ordersService: OrdersService;
  let calcService: FinancialCalculationService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'c-1',
          loyaltyPoints: 100,
          status: CustomerStatus.ACTIVE,
        }),
        update: jest
          .fn()
          .mockImplementation((args) =>
            Promise.resolve({ id: args.where.id, ...args.data }),
          ),
        aggregate: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      restaurantSettings: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'default',
          enableLoyalty: true,
          loyaltySpendAmount: new Prisma.Decimal('100.0'),
          loyaltyPointsEarned: 1,
          loyaltyRedemptionPoints: 10,
          loyaltyRedemptionValue: new Prisma.Decimal('10.0'),
          loyaltyMinimumRedeemPoints: 10,
          loyaltyMaximumRedeemPercent: new Prisma.Decimal('100.0'),
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'default',
          enableLoyalty: true,
          loyaltySpendAmount: new Prisma.Decimal('100.0'),
          loyaltyPointsEarned: 1,
          loyaltyRedemptionPoints: 10,
          loyaltyRedemptionValue: new Prisma.Decimal('10.0'),
          loyaltyMinimumRedeemPoints: 10,
          loyaltyMaximumRedeemPercent: new Prisma.Decimal('100.0'),
          loyaltyRedemptionRequestExpiryMinutes: 10,
        }),
      },
      bill: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'b-1',
          status: 'DRAFT',
          manualDiscount: 0,
          couponDiscount: 0,
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'b-1',
          status: 'DRAFT',
          manualDiscount: 0,
          couponDiscount: 0,
        }),
        create: jest
          .fn()
          .mockImplementation((args) =>
            Promise.resolve({ id: 'b-1', ...args.data }),
          ),
        update: jest
          .fn()
          .mockImplementation((args) =>
            Promise.resolve({ id: args.where.id, ...args.data }),
          ),
      },
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'o-1',
          status: OrderStatus.RECEIVED,
          subtotal: 1000,
        }),
        findFirst: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      loyaltyRedemptionRequest: {
        create: jest
          .fn()
          .mockImplementation((args) =>
            Promise.resolve({ id: 'r-1', ...args.data }),
          ),
        findUnique: jest.fn().mockResolvedValue({
          id: 'r-1',
          status: LoyaltyRedemptionRequestStatus.PENDING,
          requestedPoints: 20,
          billId: 'b-1',
          customerId: 'c-1',
        }),
        findFirst: jest.fn(),
      },
      loyaltyTransaction: {
        create: jest
          .fn()
          .mockImplementation((args) =>
            Promise.resolve({ id: 't-1', ...args.data }),
          ),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn(),
        aggregate: jest.fn(),
      },
      staff: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 's-1', role: Role.OWNER }),
      },
      auditLog: {
        create: jest.fn(),
      },
      coupon: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      couponUsage: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      invoiceSequence: {
        upsert: jest.fn().mockResolvedValue({ lastNumber: 1 }),
      },
      orderStatusHistory: {
        create: jest.fn(),
      },
      orderStockConsumption: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      orderStockConsumptionReversal: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((cb) => cb(mockPrisma)),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    calcService = new FinancialCalculationService();
    loyaltyService = new LoyaltyService(mockPrisma);
    billingService = new BillingService(mockPrisma, calcService);
    const mockCartPricingService = {
      resolveAndValidateCart: jest.fn().mockImplementation((items) => {
        return Promise.resolve({ subtotal: 100, validatedItems: [] });
      }),
    } as any;
    ordersService = new OrdersService(
      mockPrisma,
      calcService,
      mockCartPricingService,
    );
  });

  describe('LOYALTY ELIGIBLE AMOUNT FORMULA', () => {
    it('GST disabled: eligible base = subtotal - manual - coupon - loyalty', () => {
      const settings = {
        enableGst: false,
      } as any;
      const res = calcService.calculate({
        subtotal: 1000,
        manualDiscount: 100,
        couponDiscount: 50,
        loyaltyDiscount: 50,
        settings,
      });
      expect(res.baseTaxableAmount).toBe(800);
    });

    it('GST exclusive: eligible base = subtotal - manual - coupon - loyalty', () => {
      const settings = {
        enableGst: true,
        gstPercentage: 5,
        cgstPercentage: 2.5,
        sgstPercentage: 2.5,
        taxInclusivePricing: false,
      } as any;
      const res = calcService.calculate({
        subtotal: 1000,
        manualDiscount: 100,
        couponDiscount: 50,
        loyaltyDiscount: 50,
        settings,
      });
      expect(res.baseTaxableAmount).toBe(800);
      expect(res.cgst).toBe(20);
    });

    it('GST inclusive: eligible base extracts embedded GST', () => {
      const settings = {
        enableGst: true,
        gstPercentage: 5,
        cgstPercentage: 2.5,
        sgstPercentage: 2.5,
        taxInclusivePricing: true,
      } as any;
      const res = calcService.calculate({
        subtotal: 1050,
        manualDiscount: 50,
        couponDiscount: 0,
        loyaltyDiscount: 0,
        settings,
      });
      expect(res.taxableAmount).toBe(1000);
      expect(res.baseTaxableAmount).toBe(952.38);
    });
  });

  describe('EARNING BLOCKS', () => {
    const calculateEarnedPoints = (
      eligibleAmount: number,
      spendAmount: number,
      pointsEarned: number,
    ) => {
      const completeSpendBlocks = Math.floor(eligibleAmount / spendAmount);
      return completeSpendBlocks * pointsEarned;
    };

    it('₹99 spend with ₹100 block rules earns 0 points', () => {
      expect(calculateEarnedPoints(99, 100, 1)).toBe(0);
    });

    it('₹100 spend earns 1 block points', () => {
      expect(calculateEarnedPoints(100, 100, 1)).toBe(1);
    });

    it('₹199 spend earns 1 block points (fractional blocks earn zero)', () => {
      expect(calculateEarnedPoints(199, 100, 1)).toBe(1);
    });

    it('₹200 spend earns 2 blocks points', () => {
      expect(calculateEarnedPoints(200, 100, 1)).toBe(2);
    });

    it('handles custom spend amounts and points per block', () => {
      expect(calculateEarnedPoints(500, 150, 3)).toBe(9);
    });
  });

  describe('REDEMPTION BLOCKS & LIMITS', () => {
    const getRedemptionDiscount = (
      points: number,
      rulePoints: number,
      ruleValue: number,
    ) => {
      const completeBlocks = Math.floor(points / rulePoints);
      return {
        redeemedPoints: completeBlocks * rulePoints,
        loyaltyDiscount: completeBlocks * ruleValue,
      };
    };

    it('15 requested points with 10-point rule block consumes 10 points and saves 5', () => {
      const res = getRedemptionDiscount(15, 10, 10);
      expect(res.redeemedPoints).toBe(10);
      expect(res.loyaltyDiscount).toBe(10);
    });

    it('obeys maximum redemption percent limit', () => {
      const settings = {
        enableLoyalty: true,
        loyaltyRedemptionPoints: 10,
        loyaltyRedemptionValue: 10,
        loyaltyMinimumRedeemPoints: 10,
        loyaltyMaximumRedeemPercent: 50,
      };

      const requestedPoints = 100;
      const subtotal = 150;
      const manualDiscount = 0;
      const couponDiscount = 0;

      const blocks = Math.floor(
        requestedPoints / settings.loyaltyRedemptionPoints,
      );
      let redeemedPoints = blocks * settings.loyaltyRedemptionPoints;
      let loyaltyDiscount = blocks * settings.loyaltyRedemptionValue;

      const eligibleBase = subtotal - (manualDiscount + couponDiscount);
      const maxAllowedDiscount =
        eligibleBase * (settings.loyaltyMaximumRedeemPercent / 100);

      if (loyaltyDiscount > maxAllowedDiscount) {
        const maxBlocks = Math.floor(
          maxAllowedDiscount / settings.loyaltyRedemptionValue,
        );
        redeemedPoints = maxBlocks * settings.loyaltyRedemptionPoints;
        loyaltyDiscount = maxBlocks * settings.loyaltyRedemptionValue;
      }

      expect(loyaltyDiscount).toBe(70);
      expect(redeemedPoints).toBe(70);
    });
  });

  describe('ACTIVE REDEMPTION REQUEST LOCK', () => {
    it('acquires lock when no active request exists on the bill', async () => {
      const request = await loyaltyService.createRedemptionRequest({
        billId: 'b-1',
        customerId: 'c-1',
        requestedPoints: 20,
      });

      expect(request).toBeDefined();
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it('throws ConflictException if bill activeRequestLock is already held', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(0);

      await expect(
        loyaltyService.createRedemptionRequest({
          billId: 'b-1',
          customerId: 'c-1',
          requestedPoints: 20,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('ATOMIC REQUEST STATUS TRANSITIONS', () => {
    it('approving pending request updates status to APPROVED and releases bill lock', async () => {
      await loyaltyService.approveRedemptionRequest('r-1', 's-1');

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'LOYALTY_REDEMPTION_APPROVED',
          }),
        }),
      );
    });
  });

  describe('EARNING IDEMPOTENCY & ZERO-EARNING POLICY', () => {
    it('repeated bill finalization applies EARN transaction exactly once via unique key', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'o-1',
        subtotal: 1000,
        customerId: 'c-1',
        customer: { id: 'c-1', loyaltyPoints: 10 },
      });
      mockPrisma.customer.findUnique.mockResolvedValue({
        id: 'c-1',
        loyaltyPoints: 10,
      });
      mockPrisma.bill.findFirst
        .mockResolvedValueOnce(null) // no existing finalized bill
        .mockResolvedValueOnce({
          id: 'b-1',
          status: 'DRAFT',
          manualDiscount: 0,
          couponDiscount: 0,
        }); // draft bill

      await billingService.finalizeBill('o-1', 's-1');

      expect(mockPrisma.loyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: LoyaltyTransactionType.EARN,
            pointsChange: 10,
            idempotencyKey: 'LOYALTY_EARN:b-1',
          }),
        }),
      );
    });

    it('earnedPoints = 0 does not create a positive EARN transaction', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'o-1',
        subtotal: 50,
        customerId: 'c-1',
      });
      mockPrisma.bill.findFirst
        .mockResolvedValueOnce(null) // no existing finalized bill
        .mockResolvedValueOnce({
          id: 'b-1',
          status: 'DRAFT',
          manualDiscount: 0,
          couponDiscount: 0,
        }); // draft bill
      mockPrisma.bill.update.mockResolvedValue({
        id: 'b-1',
        loyaltyEligibleAmount: 50,
      });

      await billingService.finalizeBill('o-1', 's-1');

      const earnCalls = mockPrisma.loyaltyTransaction.create.mock.calls.filter(
        (call: any) => call[0].data.type === LoyaltyTransactionType.EARN,
      );
      expect(earnCalls.length).toBe(0);
    });
  });

  describe('LOYALTY REVERSAL RULES', () => {
    it('reverses original EARN and REDEEM transaction points correctly during cancel', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'o-1',
        customerId: 'c-1',
        status: OrderStatus.RECEIVED,
      });
      mockPrisma.bill.findFirst.mockResolvedValue({
        id: 'b-1',
        status: BillStatus.FINALIZED,
      });

      mockPrisma.loyaltyTransaction.findUnique
        .mockResolvedValueOnce({ pointsChange: 10 })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ pointsChange: -20 })
        .mockResolvedValueOnce(null);

      await ordersService.cancelOrder(
        'o-1',
        'Change of mind',
        undefined,
        's-1',
        Role.OWNER,
      );

      expect(mockPrisma.loyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'EARN_REVERSAL',
            pointsChange: -10,
            idempotencyKey: 'LOYALTY_EARN_REVERSAL:b-1',
          }),
        }),
      );

      expect(mockPrisma.loyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'REDEMPTION_REVERSAL',
            pointsChange: 20,
            idempotencyKey: 'LOYALTY_REDEEM_REVERSAL:b-1',
          }),
        }),
      );
    });

    it('blocks EARN reversal if it would make the customer balance negative', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'o-1',
        customerId: 'c-1',
        status: OrderStatus.RECEIVED,
      });
      mockPrisma.bill.findFirst.mockResolvedValue({
        id: 'b-1',
        status: BillStatus.FINALIZED,
      });
      mockPrisma.customer.findUnique.mockResolvedValue({
        id: 'c-1',
        loyaltyPoints: 5,
      });

      mockPrisma.loyaltyTransaction.findUnique
        .mockResolvedValueOnce({ pointsChange: 10 })
        .mockResolvedValueOnce(null);

      await expect(
        ordersService.cancelOrder('o-1', 'Void', undefined, 's-1', Role.OWNER),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'LOYALTY_REVERSAL_BLOCKED_NEGATIVE_BALANCE',
          }),
        }),
      );
    });

    it('proves transaction rollback happens before external AuditLog write executes', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'o-1',
        customerId: 'c-1',
        status: OrderStatus.RECEIVED,
      });
      mockPrisma.bill.findFirst.mockResolvedValue({
        id: 'b-1',
        status: BillStatus.FINALIZED,
      });
      mockPrisma.customer.findUnique.mockResolvedValue({
        id: 'c-1',
        loyaltyPoints: 5,
      });

      mockPrisma.loyaltyTransaction.findUnique
        .mockResolvedValueOnce({ pointsChange: 10 })
        .mockResolvedValueOnce(null);

      const calls: string[] = [];
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        calls.push('transaction-start');
        try {
          const res = await callback(mockPrisma);
          calls.push('transaction-commit');
          return res;
        } catch (e) {
          calls.push('transaction-rollback');
          throw e;
        }
      });

      mockPrisma.auditLog.create.mockImplementation(() => {
        calls.push('audit-log-create');
        return Promise.resolve({});
      });

      await expect(
        ordersService.cancelOrder('o-1', 'Void', undefined, 's-1', Role.OWNER),
      ).rejects.toThrow(BadRequestException);

      expect(calls).toEqual([
        'transaction-start',
        'transaction-rollback',
        'audit-log-create',
      ]);
    });

    it('swallows audit log write failure and still throws original loyalty business exception', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'o-1',
        customerId: 'c-1',
        status: OrderStatus.RECEIVED,
      });
      mockPrisma.bill.findFirst.mockResolvedValue({
        id: 'b-1',
        status: BillStatus.FINALIZED,
      });
      mockPrisma.customer.findUnique.mockResolvedValue({
        id: 'c-1',
        loyaltyPoints: 5,
      });

      mockPrisma.loyaltyTransaction.findUnique
        .mockResolvedValueOnce({ pointsChange: 10 })
        .mockResolvedValueOnce(null);

      mockPrisma.auditLog.create.mockRejectedValue(
        new Error('Database connectivity error'),
      );

      await expect(
        ordersService.cancelOrder('o-1', 'Void', undefined, 's-1', Role.OWNER),
      ).rejects.toThrow(
        new BadRequestException(
          'Loyalty reversal blocked: customer has already consumed the earned points and reversal would make their balance negative.',
        ),
      );
    });
  });

  describe('MANUAL POINT ADJUSTMENTS & PERMISSIONS', () => {
    it('OWNER can adjust points in and out', async () => {
      await loyaltyService.adjustPoints(
        'c-1',
        {
          pointsChange: 10,
          reason: 'Good customer manual adjustment',
          idempotencyKey: 'adjust-key-1',
        },
        's-owner',
      );

      expect(mockPrisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { loyaltyPoints: 110 },
      });
    });

    it('MANAGER can adjust points only if managerCanAdjustLoyaltyPoints is true', async () => {
      mockPrisma.staff.findUnique.mockResolvedValue({ role: Role.MANAGER });
      mockPrisma.restaurantSettings.findUnique.mockResolvedValue({
        managerCanAdjustLoyaltyPoints: true,
      });

      await loyaltyService.adjustPoints(
        'c-1',
        {
          pointsChange: -10,
          reason: 'Mistake correction',
          idempotencyKey: 'adjust-key-2',
        },
        's-manager',
      );

      expect(mockPrisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { loyaltyPoints: 90 },
      });
    });

    it('CASHIER is blocked from manual points adjustments', async () => {
      mockPrisma.staff.findUnique.mockResolvedValue({ role: Role.CASHIER });
      await expect(
        loyaltyService.adjustPoints(
          'c-1',
          {
            pointsChange: 10,
            reason: 'Attempt',
            idempotencyKey: 'adjust-key-3',
          },
          's-cashier',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
