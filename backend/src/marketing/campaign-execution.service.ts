/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AudienceService } from './audience.service';
import { QueueService } from './queue.service';
import { ProviderFactory } from './providers/provider.factory';
import { CampaignStatus, DeliveryStatus, QueueJobStatus } from '@prisma/client';

@Injectable()
export class CampaignExecutionService {
  private readonly logger = new Logger(CampaignExecutionService.name);

  constructor(
    private prisma: PrismaService,
    private audienceService: AudienceService,
    private queueService: QueueService,
    private providerFactory: ProviderFactory,
  ) {}

  async queueCampaign(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new BadRequestException('Campaign not found');
    }

    // 1. Lifecycle transition guard
    if (
      campaign.status !== CampaignStatus.DRAFT &&
      campaign.status !== CampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException(
        `Cannot queue campaign from status: ${campaign.status}`,
      );
    }

    // 2. Idempotency: Check if jobs are already created to prevent duplicate queue generation
    const existingJobsCount = await this.prisma.marketingQueueJob.count({
      where: { campaignId },
    });
    if (existingJobsCount > 0) {
      throw new BadRequestException(
        'Queue jobs already exist for this campaign',
      );
    }

    // 3. Resolve audience using dynamic filters
    const where = this.audienceService.buildPrismaWhere(
      campaign.targetSegmentRule,
    );
    const customers = await this.prisma.customer.findMany({
      where,
      select: { id: true, phone: true },
    });

    const audienceCount = customers.length;

    // 4. Update campaign status to QUEUED & save audience count inside targetSegmentRule metadata
    const updatedRule = {
      ...(campaign.targetSegmentRule as any),
      resolvedAudienceCount: audienceCount,
    };

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.QUEUED,
        targetSegmentRule: updatedRule,
      },
    });

    // Write audit log
    await this.prisma.auditLog.create({
      data: {
        staffId: campaign.createdByStaffId,
        action: 'CAMPAIGN_QUEUED',
        entityType: 'CAMPAIGN',
        entityId: campaignId,
        newData: JSON.stringify({
          status: CampaignStatus.QUEUED,
          audienceCount,
        }),
      },
    });

    // 5. Populate queue
    const recipients = customers.map((c) => ({
      customerId: c.id,
      address: c.phone,
      payload: {
        template: {
          name: campaign.templateId,
        },
      },
    }));

    if (recipients.length > 0) {
      await this.queueService.createJobs(campaignId, recipients);
    }

    return { audienceCount };
  }

  async executeCampaign(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new BadRequestException('Campaign not found');
    }

    // Move to PROCESSING
    if (campaign.status !== CampaignStatus.QUEUED) {
      throw new BadRequestException(
        `Cannot execute campaign from status: ${campaign.status}`,
      );
    }

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.PROCESSING },
    });

    // Write audit log
    await this.prisma.auditLog.create({
      data: {
        staffId: campaign.createdByStaffId,
        action: 'CAMPAIGN_PROCESSING_STARTED',
        entityType: 'CAMPAIGN',
        entityId: campaignId,
        newData: JSON.stringify({ status: CampaignStatus.PROCESSING }),
      },
    });

    // Find queue jobs for this campaign
    const jobs = await this.prisma.marketingQueueJob.findMany({
      where: { campaignId, status: QueueJobStatus.PENDING },
    });

    const provider = this.providerFactory.getProvider(campaign.type);
    let successCount = 0;
    let failCount = 0;

    for (const job of jobs) {
      // Idempotency: Check if a delivery log already exists for this job to prevent duplicate sends
      const existingLog = await this.prisma.campaignDeliveryLog.findFirst({
        where: {
          campaignId,
          customerId: job.customerId,
          recipientAddress: job.recipientAddress,
        },
      });

      if (existingLog) {
        this.logger.warn(
          `Delivery log already exists for campaign: ${campaignId}, customer: ${job.customerId}. skipping send.`,
        );
        continue;
      }

      // Transition job to IN_PROGRESS
      await this.prisma.marketingQueueJob.update({
        where: { id: job.id },
        data: { status: QueueJobStatus.IN_PROGRESS, lockedAt: new Date() },
      });

      try {
        const res = await provider.send(job.recipientAddress, job.payload);

        // Update queue job status to COMPLETED
        await this.prisma.marketingQueueJob.update({
          where: { id: job.id },
          data: {
            status: QueueJobStatus.COMPLETED,
            lockedAt: null,
            attempts: job.attempts + 1,
          },
        });

        // Create CampaignDeliveryLog
        await this.prisma.campaignDeliveryLog.create({
          data: {
            campaignId,
            customerId: job.customerId,
            recipientAddress: job.recipientAddress,
            messageSid: res.messageSid,
            status: DeliveryStatus.SENT,
            sentAt: new Date(),
          },
        });
        successCount++;
      } catch (err: any) {
        // Update queue job status to FAILED
        await this.prisma.marketingQueueJob.update({
          where: { id: job.id },
          data: {
            status: QueueJobStatus.FAILED,
            lockedAt: null,
            attempts: job.attempts + 1,
            errorLog: err.message || 'Execution error',
          },
        });

        // Create CampaignDeliveryLog with FAILED status
        await this.prisma.campaignDeliveryLog.create({
          data: {
            campaignId,
            customerId: job.customerId,
            recipientAddress: job.recipientAddress,
            status: DeliveryStatus.FAILED,
            sentAt: new Date(),
            errorCode: err.status?.toString() || 'DISPATCH_ERROR',
          },
        });
        failCount++;
      }
    }

    const campaignFinalStatus =
      failCount > 0 && successCount === 0
        ? CampaignStatus.FAILED
        : CampaignStatus.COMPLETED;

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: campaignFinalStatus },
    });

    // Write final campaign completion/failure audit log
    await this.prisma.auditLog.create({
      data: {
        staffId: campaign.createdByStaffId,
        action:
          campaignFinalStatus === CampaignStatus.COMPLETED
            ? 'CAMPAIGN_COMPLETED'
            : 'CAMPAIGN_FAILED',
        entityType: 'CAMPAIGN',
        entityId: campaignId,
        newData: JSON.stringify({
          status: campaignFinalStatus,
          successCount,
          failCount,
        }),
      },
    });
  }

  async cancelCampaign(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new BadRequestException('Campaign not found');
    }

    if (
      campaign.status === CampaignStatus.COMPLETED ||
      campaign.status === CampaignStatus.FAILED ||
      campaign.status === CampaignStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot cancel campaign from finished status: ${campaign.status}`,
      );
    }

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.CANCELLED },
    });

    // Write cancellation audit log
    await this.prisma.auditLog.create({
      data: {
        staffId: campaign.createdByStaffId,
        action: 'CAMPAIGN_CANCELLED',
        entityType: 'CAMPAIGN',
        entityId: campaignId,
        newData: JSON.stringify({ status: CampaignStatus.CANCELLED }),
      },
    });

    // Remove pending jobs
    await this.prisma.marketingQueueJob.deleteMany({
      where: { campaignId, status: QueueJobStatus.PENDING },
    });
  }
}
