/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  CampaignStatus,
  CampaignType,
  DeliveryStatus,
  OrderStatus,
  BillStatus,
} from '@prisma/client';

@Injectable()
export class CampaignAnalyticsService {
  private readonly logger = new Logger(CampaignAnalyticsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Helper to fetch rate based on campaign channel type
   */
  private getChannelCostRate(type: CampaignType): number {
    switch (type) {
      case CampaignType.WHATSAPP:
        return 0.05;
      case CampaignType.EMAIL:
        return 0.01;
      case CampaignType.SMS:
        return 0.02;
      case CampaignType.PUSH:
        return 0.0;
      default:
        return 0.0;
    }
  }

  async getCampaignAnalytics(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        deliveryLogs: true,
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const totalAudience = campaign.deliveryLogs.length;
    const messagesQueued = campaign.deliveryLogs.filter(
      (log) => log.status === DeliveryStatus.QUEUED,
    ).length;
    const messagesSent = campaign.deliveryLogs.filter((log) =>
      (
        [
          DeliveryStatus.SENT,
          DeliveryStatus.DELIVERED,
          DeliveryStatus.READ,
        ] as any[]
      ).includes(log.status),
    ).length;
    const delivered = campaign.deliveryLogs.filter((log) =>
      ([DeliveryStatus.DELIVERED, DeliveryStatus.READ] as any[]).includes(
        log.status,
      ),
    ).length;
    const read = campaign.deliveryLogs.filter(
      (log) => log.status === DeliveryStatus.READ,
    ).length;
    const failed = campaign.deliveryLogs.filter((log) =>
      ([DeliveryStatus.FAILED, DeliveryStatus.BOUNCED] as any[]).includes(
        log.status,
      ),
    ).length;

    const deliveryRate =
      messagesSent > 0 ? (delivered / messagesSent) * 100 : 0.0;
    const readRate = delivered > 0 ? (read / delivered) * 100 : 0.0;

    // Attribution window: 72 hours
    const attributionHours = 72;
    const conversionCutoffMs = attributionHours * 60 * 60 * 1000;

    let revenueGenerated = 0;
    let attributedOrdersCount = 0;
    let convertedCustomersCount = 0;
    let couponAttributionCount = 0;
    let loyaltyAttributionCount = 0;
    let repeatCustomerAttributionCount = 0;
    let firstTimeCustomerAttributionCount = 0;

    // Filter logs that were successfully sent/delivered/read
    const targetedLogs = campaign.deliveryLogs.filter((log) =>
      (
        [
          DeliveryStatus.SENT,
          DeliveryStatus.DELIVERED,
          DeliveryStatus.READ,
        ] as any[]
      ).includes(log.status),
    );

    for (const log of targetedLogs) {
      if (!log.customerId || !log.sentAt) continue;

      const sentTime = log.sentAt.getTime();
      const cutoffTime = new Date(sentTime + conversionCutoffMs);

      // Find completed orders placed by this customer within the attribution window
      const orders = await this.prisma.order.findMany({
        where: {
          customerId: log.customerId,
          status: OrderStatus.COMPLETED,
          createdAt: {
            gte: log.sentAt,
            lte: cutoffTime,
          },
        },
        include: {
          bills: {
            where: {
              status: BillStatus.FINALIZED,
            },
            include: {
              couponUsage: true,
              loyaltyTransactions: true,
            },
          },
        },
      });

      if (orders.length > 0) {
        convertedCustomersCount++;
        attributedOrdersCount += orders.length;

        // Check if repeat vs first-time customer
        const priorOrders = await this.prisma.order.count({
          where: {
            customerId: log.customerId,
            status: OrderStatus.COMPLETED,
            createdAt: {
              lt: log.sentAt,
            },
          },
        });

        if (priorOrders === 0) {
          firstTimeCustomerAttributionCount += orders.length;
        } else {
          repeatCustomerAttributionCount += orders.length;
        }

        for (const order of orders) {
          for (const bill of order.bills) {
            revenueGenerated += Number(bill.grandTotal);

            // Coupon attribution
            if (
              campaign.couponId &&
              (bill.appliedCouponId === campaign.couponId || bill.couponUsage)
            ) {
              couponAttributionCount++;
            }

            // Loyalty attribution
            if (
              bill.loyaltyTransactions &&
              bill.loyaltyTransactions.length > 0
            ) {
              loyaltyAttributionCount++;
            }
          }
        }
      }
    }

    const conversionRate =
      totalAudience > 0 ? (convertedCustomersCount / totalAudience) * 100 : 0.0;
    const averageOrderValue =
      attributedOrdersCount > 0
        ? revenueGenerated / attributedOrdersCount
        : 0.0;
    const campaignCost = messagesSent * this.getChannelCostRate(campaign.type);
    const roi =
      campaignCost > 0
        ? ((revenueGenerated - campaignCost) / campaignCost) * 100
        : 0.0;

    return {
      campaignId,
      campaignName: campaign.name,
      status: campaign.status,
      type: campaign.type,
      totalAudience,
      messagesQueued,
      messagesSent,
      delivered,
      read,
      failed,
      deliveryRate,
      readRate,
      conversionRate,
      revenueGenerated,
      averageOrderValue,
      campaignCost,
      roi,
      attribution: {
        attributedOrdersCount,
        couponAttributions: couponAttributionCount,
        loyaltyAttributions: loyaltyAttributionCount,
        repeatCustomerAttributions: repeatCustomerAttributionCount,
        firstTimeCustomerAttributions: firstTimeCustomerAttributionCount,
      },
    };
  }

  async getOverviewAnalytics(filters?: {
    startDate?: string;
    endDate?: string;
    type?: CampaignType;
    status?: CampaignStatus;
  }) {
    const where: any = {};
    if (filters?.type) {
      where.type = filters.type;
    }
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.createdAt.lte = new Date(filters.endDate);
      }
    }

    const campaigns = await this.prisma.campaign.findMany({
      where,
      select: { id: true },
    });

    let totalRevenue = 0;
    let totalCost = 0;
    let totalAudienceSum = 0;
    let totalSentSum = 0;
    let totalDeliveredSum = 0;
    let totalReadSum = 0;
    let totalFailedSum = 0;

    const campaignStats: any[] = [];

    for (const camp of campaigns) {
      try {
        const stats = await this.getCampaignAnalytics(camp.id);
        totalRevenue += stats.revenueGenerated;
        totalCost += stats.campaignCost;
        totalAudienceSum += stats.totalAudience;
        totalSentSum += stats.messagesSent;
        totalDeliveredSum += stats.delivered;
        totalReadSum += stats.read;
        totalFailedSum += stats.failed;

        campaignStats.push(stats);
      } catch (err) {
        this.logger.error(
          `Error aggregating stats for campaign ${camp.id}`,
          err,
        );
      }
    }

    const aggregateRoi =
      totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0.0;
    const aggregateDeliveryRate =
      totalSentSum > 0 ? (totalDeliveredSum / totalSentSum) * 100 : 0.0;
    const aggregateReadRate =
      totalDeliveredSum > 0 ? (totalReadSum / totalDeliveredSum) * 100 : 0.0;

    // Delivery funnel dataset
    const deliveryFunnel = [
      { stage: 'Audience', count: totalAudienceSum },
      { stage: 'Sent', count: totalSentSum },
      { stage: 'Delivered', count: totalDeliveredSum },
      { stage: 'Read', count: totalReadSum },
    ];

    // Top campaigns by ROI
    const topPerforming = [...campaignStats]
      .sort((a, b) => b.roi - a.roi)
      .slice(0, 5)
      .map((c) => ({
        id: c.campaignId,
        name: c.campaignName,
        roi: c.roi,
        revenue: c.revenueGenerated,
      }));

    return {
      summary: {
        totalCampaigns: campaigns.length,
        totalAudience: totalAudienceSum,
        messagesSent: totalSentSum,
        delivered: totalDeliveredSum,
        read: totalReadSum,
        failed: totalFailedSum,
        totalRevenue,
        totalCost,
        roi: aggregateRoi,
        deliveryRate: aggregateDeliveryRate,
        readRate: aggregateReadRate,
      },
      deliveryFunnel,
      topPerforming,
      recentCampaigns: campaignStats.slice(0, 5),
    };
  }

  async getReports(filters?: {
    startDate?: string;
    endDate?: string;
    type?: CampaignType;
    status?: CampaignStatus;
    page?: number;
    limit?: number;
  }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters?.type) {
      where.type = filters.type;
    }
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.createdAt.lte = new Date(filters.endDate);
      }
    }

    const campaigns = await this.prisma.campaign.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const totalCampaigns = await this.prisma.campaign.count({ where });

    const reports: any[] = [];
    for (const camp of campaigns) {
      const stats = await this.getCampaignAnalytics(camp.id);
      reports.push({
        campaignId: stats.campaignId,
        campaignName: stats.campaignName,
        status: stats.status,
        type: stats.type,
        totalAudience: stats.totalAudience,
        deliveryRate: stats.deliveryRate,
        readRate: stats.readRate,
        conversionRate: stats.conversionRate,
        revenue: stats.revenueGenerated,
        cost: stats.campaignCost,
        roi: stats.roi,
      });
    }

    return {
      data: reports,
      pagination: {
        page,
        limit,
        total: totalCampaigns,
        pages: Math.ceil(totalCampaigns / limit),
      },
    };
  }
}
