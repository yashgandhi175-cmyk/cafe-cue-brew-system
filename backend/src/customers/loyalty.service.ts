import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  LoyaltyTransactionType,
  LoyaltyRedemptionRequestStatus,
  CustomerStatus,
  Role,
} from '@prisma/client';
import { Prisma } from '@prisma/client';

@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  // Helper for authorization & permissions
  private async checkPermission(
    staffId: string,
    capability:
      | 'managerCanAdjustLoyaltyPoints'
      | 'managerCanApproveLoyaltyRedemption'
      | 'ownerOnly',
  ) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
    });
    if (!staff) {
      throw new ForbiddenException('Staff member not found.');
    }
    if (staff.role === Role.OWNER) {
      return;
    }
    if (capability === 'ownerOnly') {
      throw new ForbiddenException('Only owners can perform this action.');
    }

    const settings = await this.prisma.restaurantSettings.findUnique({
      where: { id: 'current' }, // Assuming single settings row
    });
    if (!settings) {
      throw new ForbiddenException('Settings not initialized.');
    }

    if (
      capability === 'managerCanAdjustLoyaltyPoints' &&
      staff.role === Role.MANAGER &&
      settings.managerCanAdjustLoyaltyPoints
    ) {
      return;
    }
    if (
      capability === 'managerCanApproveLoyaltyRedemption' &&
      staff.role === Role.MANAGER &&
      settings.managerCanApproveLoyaltyRedemption
    ) {
      return;
    }

    throw new ForbiddenException(
      'You do not have permission to manage loyalty.',
    );
  }

  // Get loyalty profile/status for a customer
  async getLoyaltyProfile(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    const settings = (await this.prisma.restaurantSettings.findFirst()) || {
      enableLoyalty: false,
      loyaltySpendAmount: new Prisma.Decimal('100.0'),
      loyaltyPointsEarned: 1,
      loyaltyRedemptionPoints: 10,
      loyaltyRedemptionValue: new Prisma.Decimal('10.0'),
      loyaltyMinimumRedeemPoints: 10,
      loyaltyMaximumRedeemPercent: new Prisma.Decimal('100.0'),
    };

    const recentTransactions = await this.prisma.loyaltyTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      customerId,
      loyaltyPoints: customer.loyaltyPoints,
      loyaltyEnabled: settings.enableLoyalty,
      earningRule: {
        spendAmount: Number(settings.loyaltySpendAmount),
        pointsEarned: settings.loyaltyPointsEarned,
      },
      redemptionRule: {
        redemptionPoints: settings.loyaltyRedemptionPoints,
        redemptionValue: Number(settings.loyaltyRedemptionValue),
        minimumRedeemPoints: settings.loyaltyMinimumRedeemPoints,
        maximumRedeemPercent: Number(settings.loyaltyMaximumRedeemPercent),
      },
      recentTransactions,
    };
  }

  // Paginated Loyalty Ledger
  async getTransactions(customerId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const finalLimit = Math.min(limit, 100);

    const [items, total] = await Promise.all([
      this.prisma.loyaltyTransaction.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: finalLimit,
        include: {
          createdBy: { select: { name: true } },
        },
      }),
      this.prisma.loyaltyTransaction.count({ where: { customerId } }),
    ]);

    return { items, total, page, limit: finalLimit };
  }

  // Create a pending redemption request
  async createRedemptionRequest(dto: {
    billId: string;
    customerId: string;
    requestedPoints: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const settings = await tx.restaurantSettings.findFirst();
      if (!settings || !settings.enableLoyalty) {
        throw new BadRequestException('Loyalty system is currently disabled.');
      }

      const customer = await tx.customer.findUnique({
        where: { id: dto.customerId },
      });
      if (!customer) throw new NotFoundException('Customer not found.');
      if (customer.status !== CustomerStatus.ACTIVE) {
        throw new BadRequestException(
          'Loyalty redemption is only allowed for active customers.',
        );
      }

      const bill = await tx.bill.findUnique({ where: { id: dto.billId } });
      if (!bill) throw new NotFoundException('Bill not found.');
      if (bill.status !== 'DRAFT') {
        throw new BadRequestException(
          'Loyalty redemption requests can only be made for draft bills.',
        );
      }

      // Check available points
      if (customer.loyaltyPoints < dto.requestedPoints) {
        throw new BadRequestException('Insufficient loyalty points.');
      }

      // Check redemption rules
      if (dto.requestedPoints < settings.loyaltyMinimumRedeemPoints) {
        throw new BadRequestException(
          `Minimum points required to redeem is ${settings.loyaltyMinimumRedeemPoints}.`,
        );
      }

      const expiresAt = new Date(
        Date.now() + settings.loyaltyRedemptionRequestExpiryMinutes * 60 * 1000,
      );

      const request = await tx.loyaltyRedemptionRequest.create({
        data: {
          billId: dto.billId,
          customerId: dto.customerId,
          requestedPoints: dto.requestedPoints,
          status: LoyaltyRedemptionRequestStatus.PENDING,
          expiresAt,
        },
      });

      // Atomic conditional update for Bill activeRequestLock
      const updatedBills = await tx.$executeRaw`
        UPDATE \`Bill\`
        SET \`activeRedemptionRequestId\` = ${request.id}
        WHERE \`id\` = ${dto.billId} AND \`activeRedemptionRequestId\` IS NULL
      `;

      if (updatedBills === 0) {
        throw new ConflictException(
          'This bill already has a pending or active redemption request.',
        );
      }

      return request;
    });
  }

  // Read redemption request details
  async getRedemptionRequest(id: string) {
    const request = await this.prisma.loyaltyRedemptionRequest.findUnique({
      where: { id },
      include: { customer: true, bill: true },
    });
    if (!request) {
      throw new NotFoundException('Redemption request not found.');
    }
    return request;
  }

  // Opportunistic request expiry check
  async checkRequestExpiry(requestId: string) {
    const request = await this.prisma.loyaltyRedemptionRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.status !== LoyaltyRedemptionRequestStatus.PENDING) {
      return;
    }

    if (request.expiresAt && request.expiresAt <= new Date()) {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.$executeRaw`
          UPDATE \`LoyaltyRedemptionRequest\`
          SET \`status\` = 'EXPIRED', \`expiredAt\` = NOW()
          WHERE \`id\` = ${requestId} AND \`status\` = 'PENDING'
        `;

        if (updated > 0) {
          await tx.$executeRaw`
            UPDATE \`Bill\`
            SET \`activeRedemptionRequestId\` = NULL
            WHERE \`id\` = ${request.billId} AND \`activeRedemptionRequestId\` = ${requestId}
          `;
        }
      });
    }
  }

  // Approve a redemption request
  async approveRedemptionRequest(requestId: string, staffId: string) {
    await this.checkPermission(staffId, 'managerCanApproveLoyaltyRedemption');
    await this.checkRequestExpiry(requestId);

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.loyaltyRedemptionRequest.findUnique({
        where: { id: requestId },
      });
      if (!request)
        throw new NotFoundException('Redemption request not found.');
      if (request.status !== LoyaltyRedemptionRequestStatus.PENDING) {
        throw new BadRequestException('Request is no longer pending.');
      }

      const customer = await tx.customer.findUnique({
        where: { id: request.customerId },
      });
      if (!customer) throw new NotFoundException('Customer not found.');

      if (customer.loyaltyPoints < request.requestedPoints) {
        throw new BadRequestException('Customer no longer has enough points.');
      }

      // Transition request status
      const updatedRequests = await tx.$executeRaw`
        UPDATE \`LoyaltyRedemptionRequest\`
        SET \`status\` = 'APPROVED', \`approvedPoints\` = ${request.requestedPoints}, \`approvedAt\` = NOW(), \`approvedByStaffId\` = ${staffId}
        WHERE \`id\` = ${requestId} AND \`status\` = 'PENDING'
      `;

      if (updatedRequests === 0) {
        throw new ConflictException(
          'Request was resolved concurrently by another process.',
        );
      }

      // Release Bill active lock (we keep activeRedemptionRequestId set on the bill to remember the request linked to it)
      // Wait, the instruction says: "Every successful terminal transition must release: Bill.activeRedemptionRequestId using request ownership"
      // Wait! If we release activeRedemptionRequestId by setting it to NULL, how does the bill finalization flow know which redemption request to resolve?
      // Ah! The instruction says: "11. Every successful terminal transition must release: Bill.activeRedemptionRequestId using request ownership: WHERE id = billId AND activeRedemptionRequestId = requestId"
      // But wait! If the bill is finalized, we resolve the approved redemption. If it's cancelled/rejected, we release the lock.
      // Yes! Setting `activeRedemptionRequestId = NULL` releases the lock on the bill.
      // Let's release the lock:
      await tx.$executeRaw`
        UPDATE \`Bill\`
        SET \`activeRedemptionRequestId\` = NULL
        WHERE \`id\` = ${request.billId} AND \`activeRedemptionRequestId\` = ${requestId}
      `;

      // Log to AuditLog
      await tx.auditLog.create({
        data: {
          staffId,
          action: 'LOYALTY_REDEMPTION_APPROVED',
          entityType: 'LoyaltyRedemptionRequest',
          entityId: requestId,
          newData: JSON.stringify({
            requestId,
            customerId: request.customerId,
            points: request.requestedPoints,
          }),
          ipAddress: '127.0.0.1',
        },
      });

      return tx.loyaltyRedemptionRequest.findUnique({
        where: { id: requestId },
      });
    });
  }

  // Reject a redemption request
  async rejectRedemptionRequest(requestId: string, staffId: string) {
    await this.checkPermission(staffId, 'managerCanApproveLoyaltyRedemption');
    await this.checkRequestExpiry(requestId);

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.loyaltyRedemptionRequest.findUnique({
        where: { id: requestId },
      });
      if (!request)
        throw new NotFoundException('Redemption request not found.');
      if (request.status !== LoyaltyRedemptionRequestStatus.PENDING) {
        throw new BadRequestException('Request is no longer pending.');
      }

      const updatedRequests = await tx.$executeRaw`
        UPDATE \`LoyaltyRedemptionRequest\`
        SET \`status\` = 'REJECTED', \`rejectedAt\` = NOW(), \`rejectedByStaffId\` = ${staffId}
        WHERE \`id\` = ${requestId} AND \`status\` = 'PENDING'
      `;

      if (updatedRequests === 0) {
        throw new ConflictException(
          'Request was resolved concurrently by another process.',
        );
      }

      await tx.$executeRaw`
        UPDATE \`Bill\`
        SET \`activeRedemptionRequestId\` = NULL
        WHERE \`id\` = ${request.billId} AND \`activeRedemptionRequestId\` = ${requestId}
      `;

      await tx.auditLog.create({
        data: {
          staffId,
          action: 'LOYALTY_REDEMPTION_REJECTED',
          entityType: 'LoyaltyRedemptionRequest',
          entityId: requestId,
          newData: JSON.stringify({
            requestId,
            customerId: request.customerId,
          }),
          ipAddress: '127.0.0.1',
        },
      });

      return tx.loyaltyRedemptionRequest.findUnique({
        where: { id: requestId },
      });
    });
  }

  // Cancel a redemption request
  async cancelRedemptionRequest(requestId: string) {
    // Both owner, manager or customer context can cancel
    await this.checkRequestExpiry(requestId);

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.loyaltyRedemptionRequest.findUnique({
        where: { id: requestId },
      });
      if (!request)
        throw new NotFoundException('Redemption request not found.');
      if (request.status !== LoyaltyRedemptionRequestStatus.PENDING) {
        throw new BadRequestException('Request is no longer pending.');
      }

      const updatedRequests = await tx.$executeRaw`
        UPDATE \`LoyaltyRedemptionRequest\`
        SET \`status\` = 'CANCELLED', \`cancelledAt\` = NOW()
        WHERE \`id\` = ${requestId} AND \`status\` = 'PENDING'
      `;

      if (updatedRequests === 0) {
        throw new ConflictException(
          'Request was resolved concurrently by another process.',
        );
      }

      await tx.$executeRaw`
        UPDATE \`Bill\`
        SET \`activeRedemptionRequestId\` = NULL
        WHERE \`id\` = ${request.billId} AND \`activeRedemptionRequestId\` = ${requestId}
      `;

      return tx.loyaltyRedemptionRequest.findUnique({
        where: { id: requestId },
      });
    });
  }

  // Manual Adjust Points
  async adjustPoints(
    customerId: string,
    dto: { pointsChange: number; reason: string; idempotencyKey: string },
    staffId: string,
  ) {
    await this.checkPermission(staffId, 'managerCanAdjustLoyaltyPoints');

    if (!dto.reason || dto.reason.trim().length === 0) {
      throw new BadRequestException('Reason is mandatory.');
    }
    if (!dto.idempotencyKey || dto.idempotencyKey.trim().length === 0) {
      throw new BadRequestException('Idempotency key is required.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Check idempotency
      const existing = await tx.loyaltyTransaction.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        return existing;
      }

      const customer = await tx.customer.findUnique({
        where: { id: customerId },
      });
      if (!customer) throw new NotFoundException('Customer not found.');

      const newBalance = customer.loyaltyPoints + dto.pointsChange;
      if (newBalance < 0) {
        throw new BadRequestException(
          'Adjustment would produce a negative loyalty points balance.',
        );
      }

      // Update customer balance
      await tx.customer.update({
        where: { id: customerId },
        data: { loyaltyPoints: newBalance },
      });

      // Create transaction
      const transaction = await tx.loyaltyTransaction.create({
        data: {
          customerId,
          type:
            dto.pointsChange > 0
              ? LoyaltyTransactionType.ADJUSTMENT_IN
              : LoyaltyTransactionType.ADJUSTMENT_OUT,
          pointsChange: dto.pointsChange,
          balanceAfter: newBalance,
          reason: dto.reason,
          idempotencyKey: dto.idempotencyKey,
          createdByStaffId: staffId,
        },
      });

      // Create AuditLog
      await tx.auditLog.create({
        data: {
          staffId,
          action: 'LOYALTY_MANUAL_ADJUSTMENT',
          entityType: 'LoyaltyTransaction',
          entityId: transaction.id,
          newData: JSON.stringify({
            customerId,
            pointsChange: dto.pointsChange,
            transactionId: transaction.id,
          }),
          ipAddress: '127.0.0.1',
        },
      });

      return transaction;
    });
  }

  // Get Owner loyalty analytics
  async getAnalytics(staffId: string) {
    // Owner-only
    await this.checkPermission(staffId, 'ownerOnly');

    const totalEarned = await this.prisma.loyaltyTransaction.aggregate({
      where: { type: LoyaltyTransactionType.EARN },
      _sum: { pointsChange: true },
    });
    const totalRedeemed = await this.prisma.loyaltyTransaction.aggregate({
      where: { type: LoyaltyTransactionType.REDEEM },
      _sum: { pointsChange: true },
    });
    const totalReversed = await this.prisma.loyaltyTransaction.aggregate({
      where: {
        type: {
          in: [
            LoyaltyTransactionType.EARN_REVERSAL,
            LoyaltyTransactionType.REDEMPTION_REVERSAL,
          ],
        },
      },
      _sum: { pointsChange: true },
    });
    const totalAdjIn = await this.prisma.loyaltyTransaction.aggregate({
      where: { type: LoyaltyTransactionType.ADJUSTMENT_IN },
      _sum: { pointsChange: true },
    });
    const totalAdjOut = await this.prisma.loyaltyTransaction.aggregate({
      where: { type: LoyaltyTransactionType.ADJUSTMENT_OUT },
      _sum: { pointsChange: true },
    });

    const outstandingBalance = await this.prisma.customer.aggregate({
      _sum: { loyaltyPoints: true },
      _count: { id: true },
    });

    const customersWithPoints = await this.prisma.customer.count({
      where: { loyaltyPoints: { gt: 0 } },
    });

    const redemptions = await this.prisma.loyaltyTransaction.aggregate({
      where: { type: LoyaltyTransactionType.REDEEM },
      _count: { id: true },
      _sum: { redemptionValueSnapshot: true },
    });

    const topCustomers = await this.prisma.customer.findMany({
      where: { loyaltyPoints: { gt: 0 } },
      orderBy: { loyaltyPoints: 'desc' },
      take: 5,
      select: {
        id: true,
        name: true,
        phone: true,
        loyaltyPoints: true,
      },
    });

    // Group transactions from last 7 days by date
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const trendTx = await this.prisma.loyaltyTransaction.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
      },
      select: {
        createdAt: true,
        type: true,
        pointsChange: true,
      },
    });

    const trendMap: Record<string, { earned: number; redeemed: number }> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      trendMap[dateStr] = { earned: 0, redeemed: 0 };
    }

    trendTx.forEach((tx) => {
      const dateStr = tx.createdAt.toISOString().split('T')[0];
      if (trendMap[dateStr]) {
        if (tx.type === LoyaltyTransactionType.EARN) {
          trendMap[dateStr].earned += tx.pointsChange;
        } else if (tx.type === LoyaltyTransactionType.REDEEM) {
          trendMap[dateStr].redeemed += Math.abs(tx.pointsChange);
        }
      }
    });

    const trend = Object.entries(trendMap)
      .map(([date, data]) => ({
        date,
        ...data,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      pointsEarned: totalEarned._sum.pointsChange || 0,
      pointsRedeemed: Math.abs(totalRedeemed._sum.pointsChange || 0),
      pointsReversed: totalReversed._sum.pointsChange || 0,
      manualAdjustmentIn: totalAdjIn._sum.pointsChange || 0,
      manualAdjustmentOut: Math.abs(totalAdjOut._sum.pointsChange || 0),
      outstandingLoyaltyPoints: outstandingBalance._sum.loyaltyPoints || 0,
      customersWithLoyaltyPoints: customersWithPoints,
      averagePointsPerActiveCustomer:
        customersWithPoints > 0
          ? (outstandingBalance._sum.loyaltyPoints || 0) / customersWithPoints
          : 0,
      redemptionCount: redemptions._count.id || 0,
      redemptionValue: Number(redemptions._sum.redemptionValueSnapshot || 0),
      topLoyaltyCustomers: topCustomers,
      loyaltyTransactionsTrend: trend,
    };
  }

  async listRedemptionRequests(filter: {
    billId?: string;
    customerId?: string;
    status?: LoyaltyRedemptionRequestStatus;
  }) {
    return this.prisma.loyaltyRedemptionRequest.findMany({
      where: {
        billId: filter.billId,
        customerId: filter.customerId,
        status: filter.status,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
