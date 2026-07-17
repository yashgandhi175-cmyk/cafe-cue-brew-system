/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { QueueJobStatus } from '@prisma/client';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(private prisma: PrismaService) {}

  async createJobs(
    campaignId: string,
    recipients: { customerId?: string; address: string; payload: any }[],
  ) {
    this.logger.log(
      `Creating ${recipients.length} queue jobs for campaign ${campaignId}`,
    );

    return this.prisma.marketingQueueJob.createMany({
      data: recipients.map((r) => ({
        campaignId,
        customerId: r.customerId || null,
        recipientAddress: r.address,
        payload: r.payload,
        status: QueueJobStatus.PENDING,
        attempts: 0,
        runAfter: new Date(),
      })),
    });
  }

  async processBatch(
    batchSize: number = 50,
    executionTimeoutMs: number = 25000,
  ) {
    const startTime = Date.now();
    this.logger.log(
      `Queue started: processing batch up to ${batchSize} jobs (timeout: ${executionTimeoutMs}ms)`,
    );

    // 1. Lock a batch of pending jobs using SELECT FOR UPDATE SKIP LOCKED
    let jobsToProcess: { id: string; payload: any; attempts: number }[] = [];

    try {
      jobsToProcess = await this.prisma.$transaction(async (tx) => {
        const lockedJobs = await tx.$queryRawUnsafe<
          { id: string; payload: string; attempts: number }[]
        >(
          `SELECT id, payload, attempts FROM \`MarketingQueueJob\`
           WHERE \`status\` = 'PENDING'
             AND \`runAfter\` <= NOW()
             AND \`attempts\` < 5
           LIMIT ${batchSize}
           FOR UPDATE SKIP LOCKED;`,
        );

        if (lockedJobs.length === 0) {
          return [];
        }

        const ids = lockedJobs.map((job) => job.id);

        await tx.$executeRawUnsafe(
          `UPDATE \`MarketingQueueJob\`
           SET \`status\` = 'IN_PROGRESS', \`lockedAt\` = NOW()
           WHERE \`id\` IN (${ids.map((id) => `'${id}'`).join(',')});`,
        );

        return lockedJobs.map((j) => ({
          id: j.id,
          payload:
            typeof j.payload === 'string' ? JSON.parse(j.payload) : j.payload,
          attempts: j.attempts,
        }));
      });
    } catch (err: any) {
      this.logger.error('Queue failed: error locking batch', err.stack);
      throw err;
    }

    if (jobsToProcess.length === 0) {
      this.logger.log('Queue completed: no pending jobs found');
      return { processed: 0, completed: 0, failed: 0, retrying: 0 };
    }

    let completed = 0;
    let failed = 0;
    let retrying = 0;

    // 2. Process each job sequentially, checking timeout bounds
    for (const job of jobsToProcess) {
      if (Date.now() - startTime >= executionTimeoutMs) {
        this.logger.warn(`Execution timeout reached. Stopping batch early.`);
        // Revert remaining locked jobs in batch back to PENDING so other runs can pick them up
        const remainingIds = jobsToProcess
          .slice(completed + failed + retrying)
          .map((j) => j.id);
        if (remainingIds.length > 0) {
          await this.prisma.marketingQueueJob.updateMany({
            where: { id: { in: remainingIds } },
            data: {
              status: QueueJobStatus.PENDING,
              lockedAt: null,
            },
          });
        }
        break;
      }

      try {
        // Milestone 3 does not execute integrations, it simulates dispatches.
        // We trigger failure simulation if payload has simulateFailure: true
        if (job.payload && job.payload.simulateFailure === true) {
          throw new Error(
            job.payload.errorMessage || 'Simulated execution failure',
          );
        }

        // Simulate successful send
        await this.prisma.marketingQueueJob.update({
          where: { id: job.id },
          data: {
            status: QueueJobStatus.COMPLETED,
            lockedAt: null,
            attempts: job.attempts + 1,
          },
        });
        completed++;
      } catch (execError: any) {
        const nextAttempts = job.attempts + 1;
        const errorMsg = execError.message || 'Unknown execution error';

        if (nextAttempts < 5) {
          // Retry logic: set status to PENDING with exponential backoff delay
          const backoffMinutes = Math.pow(2, nextAttempts); // 2, 4, 8, 16 mins
          const runAfter = new Date(Date.now() + backoffMinutes * 60 * 1000);

          await this.prisma.marketingQueueJob.update({
            where: { id: job.id },
            data: {
              status: QueueJobStatus.PENDING,
              attempts: nextAttempts,
              runAfter,
              lockedAt: null,
              errorLog: `${errorMsg} (Retrying in ${backoffMinutes} mins)`,
            },
          });
          retrying++;
        } else {
          // Final Failure
          await this.prisma.marketingQueueJob.update({
            where: { id: job.id },
            data: {
              status: QueueJobStatus.FAILED,
              attempts: nextAttempts,
              lockedAt: null,
              errorLog: `${errorMsg} - Max attempts reached (FAILED_FINAL)`,
            },
          });
          failed++;
        }
      }
    }

    const processed = completed + failed + retrying;
    this.logger.log(
      `Queue completed: processed ${processed} jobs (completed: ${completed}, failed: ${failed}, retrying: ${retrying})`,
    );
    return { processed, completed, failed, retrying };
  }

  async recoverStaleJobs(timeoutMinutes: number = 10) {
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    this.logger.log(
      `Queue recovery started: looking for stale locked jobs before ${cutoff.toISOString()}`,
    );

    const staleJobs = await this.prisma.marketingQueueJob.findMany({
      where: {
        status: QueueJobStatus.IN_PROGRESS,
        lockedAt: { lte: cutoff },
      },
      select: { id: true, attempts: true },
    });

    if (staleJobs.length === 0) {
      this.logger.log('Queue recovered: no stale jobs found');
      return { recovered: 0 };
    }

    const ids = staleJobs.map((j) => j.id);

    return this.prisma.$transaction(async (tx) => {
      // Revert stale locked jobs to PENDING and increment attempts
      for (const job of staleJobs) {
        await tx.marketingQueueJob.update({
          where: { id: job.id },
          data: {
            status: QueueJobStatus.PENDING,
            attempts: job.attempts + 1,
            lockedAt: null,
            errorLog: 'Reclaimed after lock timeout (stale job recovery)',
          },
        });
      }

      this.logger.log(
        `Queue recovered: successfully reclaimed ${ids.length} stale jobs`,
      );
      return { recovered: ids.length };
    });
  }

  async getQueueStatus() {
    const aggregates = await this.prisma.marketingQueueJob.groupBy({
      by: ['status'],
      _count: {
        _all: true,
      },
    });

    const statusCounts = {
      PENDING: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      FAILED: 0,
    };

    for (const group of aggregates) {
      statusCounts[group.status] = group._count._all;
    }

    return statusCounts;
  }
}
