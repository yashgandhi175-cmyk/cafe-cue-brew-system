import { Test, TestingModule } from '@nestjs/testing';
import { CouponsService } from './coupons.service';
import { CouponsController } from './coupons.controller';
import { CartPricingService } from '../orders/cart-pricing.service';
import { PrismaService } from '../common/prisma.service';
describe('Coupons Service & Controller Unit Tests', () => {
  let service: CouponsService;

  const mockPrisma = {
    coupon: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    customerCouponUsageCounter: {
      findUnique: jest.fn(),
    },
    customer: {
      findUnique: jest.fn(),
    },
    restaurantSettings: {
      findUnique: jest.fn(),
    },
    couponRedemption: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeAll(async () => {
    jest
      .spyOn(PrismaService.prototype, '$connect')
      .mockImplementation(() => Promise.resolve());
    jest
      .spyOn(PrismaService.prototype, '$disconnect')
      .mockImplementation(() => Promise.resolve());

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CouponsController],
      providers: [
        CouponsService,
        CartPricingService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<CouponsService>(CouponsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateCoupon', () => {
    it('should return invalid if coupon code not found', async () => {
      mockPrisma.coupon.findUnique.mockResolvedValue(null);
      const res = await service.validateCoupon('NONEXIST', 100);
      expect(res.valid).toBe(false);
      expect(res.message).toContain('not found');
    });

    it('should return invalid if coupon is inactive', async () => {
      mockPrisma.coupon.findUnique.mockResolvedValue({
        id: '1',
        code: 'INACTIVE',
        isActive: false,
      });
      const res = await service.validateCoupon('INACTIVE', 100);
      expect(res.valid).toBe(false);
      expect(res.message).toContain('inactive');
    });

    it('should return invalid if legacy birthday/festival type', async () => {
      mockPrisma.coupon.findUnique.mockResolvedValue({
        id: '1',
        code: 'BIRTHDAY',
        isActive: true,
        type: 'BIRTHDAY',
      });
      const res = await service.validateCoupon('BIRTHDAY', 100);
      expect(res.valid).toBe(false);
      expect(res.message).toContain('Unsupported legacy');
    });

    it('should return invalid if date range not active yet', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      mockPrisma.coupon.findUnique.mockResolvedValue({
        id: '1',
        code: 'FUTURE',
        isActive: true,
        type: 'FLAT',
        startDate: tomorrow,
        endDate: nextWeek,
      });

      const res = await service.validateCoupon('FUTURE', 100);
      expect(res.valid).toBe(false);
      expect(res.message).toContain('not active yet');
    });

    it('should return invalid if coupon is expired', async () => {
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      mockPrisma.coupon.findUnique.mockResolvedValue({
        id: '1',
        code: 'EXPIRED',
        isActive: true,
        type: 'FLAT',
        startDate: lastWeek,
        endDate: yesterday,
      });

      const res = await service.validateCoupon('EXPIRED', 100);
      expect(res.valid).toBe(false);
      expect(res.message).toContain('expired');
    });

    it('should return invalid if subtotal is below minOrder requirement', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      mockPrisma.coupon.findUnique.mockResolvedValue({
        id: '1',
        code: 'MINORDER',
        isActive: true,
        type: 'FLAT',
        startDate: yesterday,
        endDate: nextWeek,
        minOrder: 500,
      });

      const res = await service.validateCoupon('MINORDER', 100);
      expect(res.valid).toBe(false);
      expect(res.message).toContain('Minimum order amount');
    });

    it('should return invalid if usageLimit has been reached', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      mockPrisma.coupon.findUnique.mockResolvedValue({
        id: '1',
        code: 'LIMIT',
        isActive: true,
        type: 'FLAT',
        startDate: yesterday,
        endDate: nextWeek,
        minOrder: 100,
        usageLimit: 10,
        usedCount: 10,
      });

      const res = await service.validateCoupon('LIMIT', 200);
      expect(res.valid).toBe(false);
      expect(res.message).toContain('usage limit has been reached');
    });

    it('should calculate FLAT discounts correctly', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      mockPrisma.coupon.findUnique.mockResolvedValue({
        id: '1',
        code: 'FLAT100',
        isActive: true,
        type: 'FLAT',
        startDate: yesterday,
        endDate: nextWeek,
        minOrder: 100,
        value: 100,
        usageLimit: 10,
        usedCount: 0,
        perCustLimit: null,
      });

      const res = await service.validateCoupon('FLAT100', 500);
      expect(res.valid).toBe(true);
      expect(res.appliedDiscountEstimate).toBe(100);
    });

    it('should calculate PERCENTAGE discount capped at maxDiscount cap', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      mockPrisma.coupon.findUnique.mockResolvedValue({
        id: '1',
        code: 'PERCENT10',
        isActive: true,
        type: 'PERCENTAGE',
        startDate: yesterday,
        endDate: nextWeek,
        minOrder: 100,
        value: 10,
        maxDiscount: 50,
        usageLimit: null,
        usedCount: 0,
        perCustLimit: null,
      });

      // 10% of 1000 is 100, but capped at 50
      const res = await service.validateCoupon('PERCENT10', 1000);
      expect(res.valid).toBe(true);
      expect(res.appliedDiscountEstimate).toBe(50);
    });
  });

  describe('listCoupons & status toggling', () => {
    it('should invoke findMany on listing', async () => {
      mockPrisma.coupon.findMany.mockResolvedValue([]);
      await service.listCoupons({});
      expect(mockPrisma.coupon.findMany).toHaveBeenCalled();
    });

    it('should toggle coupon active status successfully', async () => {
      mockPrisma.coupon.findUnique.mockResolvedValue({ id: '1', code: 'C1' });
      mockPrisma.coupon.update.mockResolvedValue({ id: '1', isActive: false });

      await service.toggleCouponActive('1', false);
      expect(mockPrisma.coupon.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { isActive: false },
      });
    });
  });
});
