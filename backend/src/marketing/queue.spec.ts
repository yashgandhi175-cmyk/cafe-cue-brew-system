/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await, @typescript-eslint/no-unused-vars */
import { Test, TestingModule } from '@nestjs/testing';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { PrismaService } from '../common/prisma.service';
import { ApiKeyGuard } from './guards/api-key.guard';
import { ConfigService } from '@nestjs/config';
import { QueueJobStatus } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';

describe('Marketing Queue Engine Unit Tests', () => {
  let queueService: QueueService;
  let queueController: QueueController;

  const mockPrisma = {
    marketingQueueJob: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      groupBy: jest.fn(),
    },
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn(),
    $transaction: jest.fn().mockImplementation(async (callback) => {
      return callback(mockPrisma);
    }),
  };

  const mockConfig = {
    MARKETING_QUEUE_SECRET: 'super-secret-key',
  };

  const mockConfigService = {
    get: jest.fn((key: string) => mockConfig[key]),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueueController],
      providers: [
        QueueService,
        ApiKeyGuard,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    queueService = module.get<QueueService>(QueueService);
    queueController = module.get<QueueController>(QueueController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Queue Job Creation & Status', () => {
    it('createJobs - should batch insert multiple pending jobs', async () => {
      mockPrisma.marketingQueueJob.createMany.mockResolvedValue({ count: 2 });

      const res = await queueService.createJobs('campaign-1', [
        { address: '+919999999999', payload: { message: 'hi' } },
        { address: '+918888888888', payload: { message: 'hello' } },
      ]);

      expect(res.count).toBe(2);
      expect(mockPrisma.marketingQueueJob.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              campaignId: 'campaign-1',
              status: QueueJobStatus.PENDING,
            }),
          ]),
        }),
      );
    });

    it('getQueueStatus - should return aggregated status counts', async () => {
      mockPrisma.marketingQueueJob.groupBy.mockResolvedValue([
        { status: QueueJobStatus.PENDING, _count: { _all: 10 } },
        { status: QueueJobStatus.COMPLETED, _count: { _all: 5 } },
      ]);

      const status = await queueService.getQueueStatus();
      expect(status.PENDING).toBe(10);
      expect(status.COMPLETED).toBe(5);
      expect(status.IN_PROGRESS).toBe(0);
    });
  });

  describe('Job Processing & Locking', () => {
    it('processBatch - should lock jobs and mark as COMPLETED on success', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        { id: 'job-1', payload: '{"message": "test"}', attempts: 0 },
      ]);
      mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
      mockPrisma.marketingQueueJob.update.mockResolvedValue({
        id: 'job-1',
        status: QueueJobStatus.COMPLETED,
      });

      const res = await queueService.processBatch(1, 5000);
      expect(res.processed).toBe(1);
      expect(res.completed).toBe(1);
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 1'),
      );
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE `MarketingQueueJob`'),
      );
      expect(mockPrisma.marketingQueueJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1' },
          data: expect.objectContaining({
            status: QueueJobStatus.COMPLETED,
          }),
        }),
      );
    });

    it('processBatch - should handle lock bypass if query returns no results', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      const res = await queueService.processBatch(10, 5000);
      expect(res.processed).toBe(0);
      expect(mockPrisma.marketingQueueJob.update).not.toHaveBeenCalled();
    });
  });

  describe('Retry & Backoff Engine', () => {
    it('processBatch - should schedule retry with exponential backoff on failure', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          id: 'job-2',
          payload:
            '{"simulateFailure": true, "errorMessage": "Failed sending"}',
          attempts: 1,
        },
      ]);
      mockPrisma.marketingQueueJob.update.mockResolvedValue({
        id: 'job-2',
        status: QueueJobStatus.PENDING,
      });

      const res = await queueService.processBatch(1, 5000);
      expect(res.processed).toBe(1);
      expect(res.retrying).toBe(1);
      expect(mockPrisma.marketingQueueJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-2' },
          data: expect.objectContaining({
            status: QueueJobStatus.PENDING,
            attempts: 2,
            runAfter: expect.any(Date),
            errorLog: expect.stringContaining(
              'Failed sending (Retrying in 4 mins)',
            ),
          }),
        }),
      );
    });

    it('processBatch - should set status to FAILED_FINAL on 5th failure', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        { id: 'job-3', payload: '{"simulateFailure": true}', attempts: 4 },
      ]);
      mockPrisma.marketingQueueJob.update.mockResolvedValue({
        id: 'job-3',
        status: QueueJobStatus.FAILED,
      });

      const res = await queueService.processBatch(1, 5000);
      expect(res.processed).toBe(1);
      expect(res.failed).toBe(1);
      expect(mockPrisma.marketingQueueJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-3' },
          data: expect.objectContaining({
            status: QueueJobStatus.FAILED,
            attempts: 5,
            errorLog: expect.stringContaining('FAILED_FINAL'),
          }),
        }),
      );
    });
  });

  describe('Crash Recovery', () => {
    it('recoverStaleJobs - should reset jobs stale for > 10m back to PENDING and increment attempts', async () => {
      const staleJob = { id: 'job-stale', attempts: 2 };
      mockPrisma.marketingQueueJob.findMany.mockResolvedValue([staleJob]);
      mockPrisma.marketingQueueJob.update.mockResolvedValue({
        id: 'job-stale',
        status: QueueJobStatus.PENDING,
      });

      const res = await queueService.recoverStaleJobs(10);
      expect(res.recovered).toBe(1);
      expect(mockPrisma.marketingQueueJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-stale' },
          data: expect.objectContaining({
            status: QueueJobStatus.PENDING,
            attempts: 3,
            lockedAt: null,
            errorLog: expect.stringContaining('stale job recovery'),
          }),
        }),
      );
    });
  });

  describe('API Key Authentication Guard', () => {
    it('should throw UnauthorizedException if wrong api key supplied in headers', () => {
      const guard = new ApiKeyGuard(mockConfigService as any);

      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-ccb-marketing-key': 'wrong-key',
            },
          }),
        }),
      } as any;

      expect(() => guard.canActivate(mockExecutionContext)).toThrow(
        UnauthorizedException,
      );
    });

    it('should allow activation if correct api key supplied', () => {
      const guard = new ApiKeyGuard(mockConfigService as any);

      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-ccb-marketing-key': 'super-secret-key',
            },
          }),
        }),
      } as any;

      expect(guard.canActivate(mockExecutionContext)).toBe(true);
    });
  });
});
