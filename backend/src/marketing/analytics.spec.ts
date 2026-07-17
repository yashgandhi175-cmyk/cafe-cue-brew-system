/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { CampaignAnalyticsService } from './campaign-analytics.service';
import { AnalyticsController } from './analytics.controller';
import { PrismaService } from '../common/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryStatus,
  OrderStatus,
  BillStatus,
  CampaignStatus,
  CampaignType,
} from '@prisma/client';

describe('Marketing Analytics & Reports Unit Tests', () => {
  let analyticsService: CampaignAnalyticsService;
  let analyticsController: AnalyticsController;

  const mockPrisma = {
    campaign: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    order: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-log-1' }),
    },
  };

  const mockCampaignData = {
    id: 'camp-100',
    name: 'Loyalty Gold Campaign',
    status: CampaignStatus.COMPLETED,
    type: CampaignType.WHATSAPP,
    couponId: 'coupon-vip',
    createdByStaffId: 'staff-owner',
    deliveryLogs: [
      {
        id: 'log-1',
        status: DeliveryStatus.SENT,
        customerId: 'cust-10',
        sentAt: new Date(Date.now() - 3600 * 1000),
      },
      {
        id: 'log-2',
        status: DeliveryStatus.DELIVERED,
        customerId: 'cust-20',
        sentAt: new Date(Date.now() - 3600 * 1000),
      },
      {
        id: 'log-3',
        status: DeliveryStatus.READ,
        customerId: 'cust-30',
        sentAt: new Date(Date.now() - 3600 * 1000),
      },
      {
        id: 'log-4',
        status: DeliveryStatus.FAILED,
        customerId: 'cust-40',
        sentAt: new Date(Date.now() - 3600 * 1000),
      },
    ],
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        CampaignAnalyticsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        ConfigService,
      ],
    }).compile();

    analyticsService = module.get<CampaignAnalyticsService>(
      CampaignAnalyticsService,
    );
    analyticsController = module.get<AnalyticsController>(AnalyticsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Campaign Analytics Calculations', () => {
    it('should compute delivery rates, read rates, and costs correctly', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(mockCampaignData);
      mockPrisma.order.findMany.mockResolvedValue([]); // no conversions

      const res = await analyticsService.getCampaignAnalytics('camp-100');

      expect(res.totalAudience).toBe(4);
      expect(res.messagesSent).toBe(3);
      expect(res.delivered).toBe(2);
      expect(res.read).toBe(1);
      expect(res.failed).toBe(1);
      expect(res.deliveryRate).toBeCloseTo(66.66, 1);
      expect(res.readRate).toBe(50.0);
      expect(res.campaignCost).toBeCloseTo(0.15, 2); // 3 sent * 0.05
    });
  });

  describe('Campaign 72h Attribution & ROI', () => {
    it('should attribute order revenue, coupons and calculate ROI', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(mockCampaignData);

      // Simulate a completed order within 72 hours for customer 30
      const mockOrder = {
        id: 'ord-123',
        customerId: 'cust-30',
        status: OrderStatus.COMPLETED,
        createdAt: new Date(),
        bills: [
          {
            id: 'bill-123',
            grandTotal: 150.0,
            status: BillStatus.FINALIZED,
            appliedCouponId: 'coupon-vip',
            loyaltyTransactions: [{ id: 'lt-1' }],
          },
        ],
      };

      mockPrisma.order.findMany.mockImplementation(async (args: any) => {
        if (args.where.customerId === 'cust-30') {
          return [mockOrder];
        }
        return [];
      });

      // Customer 30 has 2 prior completed orders -> repeat customer
      mockPrisma.order.count.mockResolvedValue(2);

      const res = await analyticsService.getCampaignAnalytics('camp-100');

      expect(res.conversionRate).toBe(25.0); // 1 converted customer / 4 audience
      expect(res.revenueGenerated).toBe(150.0);
      expect(res.averageOrderValue).toBe(150.0);
      expect(res.attribution.couponAttributions).toBe(1);
      expect(res.attribution.loyaltyAttributions).toBe(1);
      expect(res.attribution.repeatCustomerAttributions).toBe(1);
      expect(res.attribution.firstTimeCustomerAttributions).toBe(0);
      expect(res.roi).toBeCloseTo(((150.0 - 0.15) / 0.15) * 100, 2);
    });
  });

  describe('Dashboard Overview & Funnel Analytics', () => {
    it('should aggregate campaign totals and format delivery funnel dataset', async () => {
      mockPrisma.campaign.findMany.mockResolvedValue([{ id: 'camp-100' }]);
      mockPrisma.campaign.findUnique.mockResolvedValue(mockCampaignData);
      mockPrisma.order.findMany.mockResolvedValue([]);

      const overview = await analyticsService.getOverviewAnalytics();

      expect(overview.summary.totalCampaigns).toBe(1);
      expect(overview.summary.totalAudience).toBe(4);
      expect(overview.deliveryFunnel).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ stage: 'Audience', count: 4 }),
          expect.objectContaining({ stage: 'Sent', count: 3 }),
          expect.objectContaining({ stage: 'Delivered', count: 2 }),
          expect.objectContaining({ stage: 'Read', count: 1 }),
        ]),
      );
    });
  });

  describe('Reports Pagination', () => {
    it('should return paginated campaign reports', async () => {
      mockPrisma.campaign.findMany.mockResolvedValue([{ id: 'camp-100' }]);
      mockPrisma.campaign.count.mockResolvedValue(1);
      mockPrisma.campaign.findUnique.mockResolvedValue(mockCampaignData);
      mockPrisma.order.findMany.mockResolvedValue([]);

      const res = await analyticsService.getReports({ page: 1, limit: 10 });
      expect(res.data.length).toBe(1);
      expect(res.pagination.total).toBe(1);
      expect(res.pagination.page).toBe(1);
      expect(res.pagination.pages).toBe(1);
    });
  });

  describe('Audit Logging for Analytics Views', () => {
    it('should record audit log when fetching overview dashboard', async () => {
      mockPrisma.campaign.findMany.mockResolvedValue([]);

      await analyticsController.getOverview({ id: 'staff-owner' });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'DASHBOARD_OPENED',
            staffId: 'staff-owner',
          }),
        }),
      );
    });

    it('should record audit log when viewing campaign analytics', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(mockCampaignData);
      mockPrisma.order.findMany.mockResolvedValue([]);

      await analyticsController.getCampaignAnalytics(
        { id: 'staff-owner' },
        'camp-100',
      );

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ANALYTICS_VIEWED',
            entityId: 'camp-100',
            staffId: 'staff-owner',
          }),
        }),
      );
    });

    it('should record audit log when exporting reports', async () => {
      mockPrisma.campaign.findMany.mockResolvedValue([]);
      mockPrisma.campaign.count.mockResolvedValue(0);

      await analyticsController.getReports({ id: 'staff-owner' });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'REPORT_EXPORTED',
            staffId: 'staff-owner',
          }),
        }),
      );
    });
  });
});
