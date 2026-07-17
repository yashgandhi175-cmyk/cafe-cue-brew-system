/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { AudienceService } from './audience.service';
import { CampaignExecutionService } from './campaign-execution.service';
import { QueueService } from './queue.service';
import { ProviderFactory } from './providers/provider.factory';
import { PrismaService } from '../common/prisma.service';
import { CampaignStatus, QueueJobStatus, DeliveryStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('Audience Builder & Campaign Execution Unit Tests', () => {
  let audienceService: AudienceService;
  let campaignExecutionService: CampaignExecutionService;

  const mockProvider = {
    send: jest.fn().mockResolvedValue({ messageSid: 'msg-wamid-123' }),
  };

  const mockProviderFactory = {
    getProvider: jest.fn().mockReturnValue(mockProvider),
  };

  const mockQueueService = {
    createJobs: jest.fn().mockResolvedValue({ count: 1 }),
  };

  const mockPrisma = {
    campaign: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    customer: {
      findMany: jest.fn(),
    },
    marketingQueueJob: {
      count: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    campaignDeliveryLog: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AudienceService,
        CampaignExecutionService,
        {
          provide: QueueService,
          useValue: mockQueueService,
        },
        {
          provide: ProviderFactory,
          useValue: mockProviderFactory,
        },
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    audienceService = module.get<AudienceService>(AudienceService);
    campaignExecutionService = module.get<CampaignExecutionService>(
      CampaignExecutionService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Audience Builder & Segment Resolver', () => {
    it('should build flat query conditions for basic customer attributes', () => {
      const ruleGroup = {
        conjunction: 'AND',
        rules: [
          { field: 'phoneExists', operator: 'EQUALS', value: true },
          { field: 'whatsappConsent', operator: 'EQUALS', value: true },
        ],
      };

      const where = audienceService.buildPrismaWhere(ruleGroup);
      expect(where.AND).toBeDefined();
      expect(where.AND?.length).toBe(2);
      expect(where.whatsappConsent).toBe(true);
    });

    it('should map loyaltyTier names to correct points ranges', () => {
      const ruleGroup = {
        conjunction: 'AND',
        rules: [{ field: 'loyaltyTier', operator: 'EQUALS', value: 'GOLD' }],
      };

      const where: any = audienceService.buildPrismaWhere(ruleGroup);
      expect(where.AND[0].loyaltyPoints.gte).toBe(500);
      expect(where.AND[0].loyaltyPoints.lte).toBe(999);
    });

    it('should support nested conjunction rules (AND / OR combinations)', () => {
      const ruleGroup = {
        conjunction: 'OR',
        rules: [
          {
            conjunction: 'AND',
            rules: [
              { field: 'totalSpend', operator: 'GREATER_THAN', value: 1000 },
            ],
          },
          { field: 'loyaltyTier', operator: 'EQUALS', value: 'PLATINUM' },
        ],
      };

      const where = audienceService.buildPrismaWhere(ruleGroup);
      expect(where.OR).toBeDefined();
      expect(where.OR?.length).toBe(2);
    });
  });

  describe('Campaign Queueing & Population', () => {
    const mockCampaign = {
      id: 'camp-1',
      name: 'Black Friday VIP Send',
      status: CampaignStatus.DRAFT,
      targetSegmentRule: { conjunction: 'AND', rules: [] },
      createdByStaffId: 'staff-owner',
      templateId: 'black_friday_template',
      type: 'WHATSAPP',
    };

    it('queueCampaign - should reject invalid transition status', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.COMPLETED,
      });

      await expect(
        campaignExecutionService.queueCampaign('camp-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('queueCampaign - should enforce idempotency (prevent duplicate queue populating)', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(mockCampaign);
      mockPrisma.marketingQueueJob.count.mockResolvedValue(10); // jobs exist

      await expect(
        campaignExecutionService.queueCampaign('camp-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('queueCampaign - should resolve audience, record count, and create queue jobs', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(mockCampaign);
      mockPrisma.marketingQueueJob.count.mockResolvedValue(0);
      mockPrisma.customer.findMany.mockResolvedValue([
        { id: 'cust-1', phone: '+919999999999' },
      ]);
      mockPrisma.campaign.update.mockResolvedValue({ id: 'camp-1' });
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'log-1' });

      const res = await campaignExecutionService.queueCampaign('camp-1');
      expect(res.audienceCount).toBe(1);
      expect(mockQueueService.createJobs).toHaveBeenCalledWith(
        'camp-1',
        expect.arrayContaining([
          expect.objectContaining({ customerId: 'cust-1' }),
        ]),
      );
      expect(mockPrisma.campaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: CampaignStatus.QUEUED,
          }),
        }),
      );
    });
  });

  describe('Campaign Execution & Delivery logs', () => {
    const queuedCampaign = {
      id: 'camp-2',
      name: 'Flash Sale Send',
      status: CampaignStatus.QUEUED,
      createdByStaffId: 'staff-owner',
      templateId: 'flash_sale',
      type: 'WHATSAPP',
    };

    it('executeCampaign - should dispatch jobs, update logs, and transition campaign state', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(queuedCampaign);
      mockPrisma.campaign.update.mockResolvedValue({ id: 'camp-2' });
      mockPrisma.marketingQueueJob.findMany.mockResolvedValue([
        {
          id: 'job-10',
          customerId: 'cust-2',
          recipientAddress: '+918888888888',
          attempts: 0,
          payload: {},
        },
      ]);
      mockPrisma.campaignDeliveryLog.findFirst.mockResolvedValue(null); // No prior send logs
      mockPrisma.marketingQueueJob.update.mockResolvedValue({ id: 'job-10' });
      mockPrisma.campaignDeliveryLog.create.mockResolvedValue({ id: 'dl-1' });
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'log-2' });

      await campaignExecutionService.executeCampaign('camp-2');

      expect(mockProviderFactory.getProvider).toHaveBeenCalledWith('WHATSAPP');
      expect(mockProvider.send).toHaveBeenCalled();
      expect(mockPrisma.campaignDeliveryLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: DeliveryStatus.SENT,
            messageSid: 'msg-wamid-123',
          }),
        }),
      );
      expect(mockPrisma.campaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: CampaignStatus.COMPLETED },
        }),
      );
    });

    it('executeCampaign - should skip message dispatch if log already exists (idempotency send check)', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(queuedCampaign);
      mockPrisma.marketingQueueJob.findMany.mockResolvedValue([
        {
          id: 'job-11',
          customerId: 'cust-2',
          recipientAddress: '+918888888888',
          attempts: 0,
          payload: {},
        },
      ]);
      // Simulate that a delivery log already exists
      mockPrisma.campaignDeliveryLog.findFirst.mockResolvedValue({
        id: 'dl-exist',
      });

      await campaignExecutionService.executeCampaign('camp-2');

      expect(mockProvider.send).not.toHaveBeenCalled();
    });
  });

  describe('Campaign Cancellation & Cleanup', () => {
    const scheduledCampaign = {
      id: 'camp-3',
      name: 'Scheduled Sale',
      status: CampaignStatus.SCHEDULED,
      createdByStaffId: 'staff-owner',
    };

    it('cancelCampaign - should transition status to CANCELLED and clean up pending queue jobs', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(scheduledCampaign);
      mockPrisma.campaign.update.mockResolvedValue({ id: 'camp-3' });
      mockPrisma.marketingQueueJob.updateMany = jest.fn();
      mockPrisma.marketingQueueJob.deleteMany = jest
        .fn()
        .mockResolvedValue({ count: 10 });

      await campaignExecutionService.cancelCampaign('camp-3');

      expect(mockPrisma.campaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: CampaignStatus.CANCELLED },
        }),
      );
      expect(mockPrisma.marketingQueueJob.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { campaignId: 'camp-3', status: QueueJobStatus.PENDING },
        }),
      );
    });
  });
});
