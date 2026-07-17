import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { FinancialCalculationService } from './financial-calculation.service';
import {
  Role,
  BillStatus,
  LoyaltyTransactionType,
  Prisma,
} from '@prisma/client';

@Injectable()
export class BillingService {
  constructor(
    private prisma: PrismaService,
    private calcService: FinancialCalculationService,
  ) {}

  async applyManualDiscount(
    orderId: string,
    staffId: string,
    staffRole: Role,
    dto: { type: 'FLAT' | 'PERCENTAGE'; value: number; reason: string },
  ) {
    if (staffRole === Role.WAITER) {
      throw new ForbiddenException(
        'Waiters are not authorized to apply manual discounts.',
      );
    }

    if (!dto.reason || dto.reason.trim().length === 0) {
      throw new BadRequestException(
        'A reason is required to apply manual discounts.',
      );
    }

    if (dto.value < 0) {
      throw new BadRequestException('Discount value cannot be negative.');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order) {
        throw new NotFoundException('Order not found.');
      }

      if (['CANCELLED', 'VOIDED'].includes(order.status)) {
        throw new BadRequestException(
          'Cannot apply discount to a cancelled or voided order.',
        );
      }

      const settings = await tx.restaurantSettings.findUnique({
        where: { id: 'default' },
      });

      if (!settings) {
        throw new NotFoundException('Restaurant settings not found.');
      }

      // Settings-backed role limit checks
      const cashierMax = Number(settings.cashierMaxDiscountPercent ?? 10.0);
      const managerMax = Number(settings.managerMaxDiscountPercent ?? 25.0);

      const subtotalNum = Number(order.subtotal);
      let discountPercent = 0;
      if (dto.type === 'PERCENTAGE') {
        discountPercent = dto.value;
      } else {
        discountPercent = subtotalNum > 0 ? (dto.value / subtotalNum) * 100 : 0;
      }

      if (dto.type === 'PERCENTAGE' && dto.value > 100) {
        throw new BadRequestException(
          'Percentage discount cannot exceed 100%.',
        );
      }

      if (staffRole === Role.CASHIER && discountPercent > cashierMax) {
        throw new ForbiddenException(
          `Cashiers are limited to a maximum ${cashierMax}% manual discount.`,
        );
      }
      if (staffRole === Role.MANAGER && discountPercent > managerMax) {
        throw new ForbiddenException(
          `Managers are limited to a maximum ${managerMax}% manual discount.`,
        );
      }

      let bill = await tx.bill.findFirst({
        where: { orderId, status: BillStatus.DRAFT },
      });

      // If no draft bill, create one first
      if (!bill) {
        bill = await tx.bill.create({
          data: {
            orderId,
            status: BillStatus.DRAFT,
            subtotal: order.subtotal,
            discount: order.discount,
            itemDiscount: 0.0,
            couponDiscount: order.couponDiscount,
            manualDiscount: 0.0,
            totalDiscount: order.discount,
            taxableAmount: order.taxableAmount,
            cgst: order.cgst,
            sgst: order.sgst,
            serviceCharge: order.serviceCharge,
            nightCharge: order.nightCharge,
            roundOff: order.roundOff,
            grandTotal: order.grandTotal,
          },
        });
      }

      // Calculate the manual discount amount
      let manualDiscountAmount = 0;
      if (dto.type === 'FLAT') {
        manualDiscountAmount = dto.value;
      } else {
        manualDiscountAmount = this.calcService.roundToTwo(
          (subtotalNum * dto.value) / 100,
        );
      }

      if (manualDiscountAmount > subtotalNum) {
        throw new BadRequestException(
          'Manual discount cannot exceed subtotal.',
        );
      }

      // Re-run shared calculations
      const calcResult = this.calcService.calculate({
        subtotal: subtotalNum,
        manualDiscount: manualDiscountAmount,
        couponDiscount: Number(order.couponDiscount),
        settings,
        // Match the order's existing night charge state (to keep calculations consistent)
        applyNightChargeOverride: Number(order.nightCharge) > 0,
      });

      // Update the draft bill
      const updatedBill = await tx.bill.update({
        where: { id: bill.id },
        data: {
          manualDiscount: calcResult.manualDiscount,
          manualDiscountType: dto.type,
          manualDiscountValue: dto.value,
          manualDiscountReason: dto.reason,
          manualDiscountAppliedBy: staffId,
          discount: calcResult.discount,
          totalDiscount: calcResult.discount,
          taxableAmount: calcResult.taxableAmount,
          cgst: calcResult.cgst,
          sgst: calcResult.sgst,
          serviceCharge: calcResult.serviceCharge,
          nightCharge: calcResult.nightCharge,
          preRoundGrandTotal: calcResult.preRoundGrandTotal,
          roundOff: calcResult.roundOff,
          grandTotal: calcResult.grandTotal,
        },
      });

      // Write to Audit Log
      await tx.auditLog.create({
        data: {
          staffId,
          action: 'DISCOUNT_APPLY',
          entityType: 'Bill',
          entityId: updatedBill.id,
          newData: JSON.stringify({
            discountType: dto.type,
            discountValue: dto.value,
            calculatedAmount: calcResult.manualDiscount,
            reason: dto.reason,
          }),
        },
      });

      return updatedBill;
    });
  }

  async finalizeBill(orderId: string, staffId: string) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { customer: true },
      });

      if (!order) {
        throw new NotFoundException('Order not found.');
      }

      if (['CANCELLED', 'VOIDED'].includes(order.status)) {
        throw new BadRequestException(
          'Cannot finalize bill for a cancelled or voided order.',
        );
      }

      const settings = await tx.restaurantSettings.findUnique({
        where: { id: 'default' },
      });

      if (!settings) {
        throw new NotFoundException('Restaurant settings not found.');
      }

      // Check if bill is already finalized/paid/voided
      const existingFinalized = await tx.bill.findFirst({
        where: {
          orderId,
          status: {
            in: [BillStatus.FINALIZED, BillStatus.PAID, BillStatus.VOIDED],
          },
        },
      });

      if (existingFinalized) {
        return existingFinalized;
      }

      // Fetch the draft bill or create one if missing
      let bill = await tx.bill.findFirst({
        where: { orderId, status: BillStatus.DRAFT },
      });

      if (!bill) {
        bill = await tx.bill.create({
          data: {
            orderId,
            status: BillStatus.DRAFT,
            subtotal: order.subtotal,
            discount: order.discount,
            itemDiscount: 0.0,
            couponDiscount: order.couponDiscount,
            manualDiscount: 0.0,
            totalDiscount: order.discount,
            taxableAmount: order.taxableAmount,
            cgst: order.cgst,
            sgst: order.sgst,
            serviceCharge: order.serviceCharge,
            nightCharge: order.nightCharge,
            roundOff: order.roundOff,
            grandTotal: order.grandTotal,
          },
        });
      }

      // Read coupon discount directly from draft bill (pre-validated and applied at checkout)
      const couponDiscount = Number(bill.couponDiscount ?? 0);

      // LOYALTY RESOLUTION (Phase 8B)
      let loyaltyDiscount = 0;
      let redeemedPoints = 0;
      let redemptionRequest = null;

      if (settings.enableLoyalty && order.customerId) {
        redemptionRequest = await tx.loyaltyRedemptionRequest.findFirst({
          where: { billId: bill.id, status: 'APPROVED' },
        });

        if (redemptionRequest) {
          const customer = await tx.customer.findUnique({
            where: { id: order.customerId },
          });

          if (
            customer &&
            customer.loyaltyPoints >= redemptionRequest.requestedPoints
          ) {
            const blocks = Math.floor(
              redemptionRequest.requestedPoints /
                settings.loyaltyRedemptionPoints,
            );
            redeemedPoints = blocks * settings.loyaltyRedemptionPoints;
            const redemptionValueDec = new Prisma.Decimal(
              settings.loyaltyRedemptionValue,
            );
            const calculatedLoyaltyDiscount = redemptionValueDec
              .mul(blocks)
              .toNumber();

            const eligibleBase =
              Number(order.subtotal) -
              (Number(bill.manualDiscount) + couponDiscount);
            const maxAllowedDiscount =
              eligibleBase *
              (Number(settings.loyaltyMaximumRedeemPercent) / 100);

            if (calculatedLoyaltyDiscount <= maxAllowedDiscount) {
              loyaltyDiscount = calculatedLoyaltyDiscount;
            } else {
              const maxAllowedDec = new Prisma.Decimal(maxAllowedDiscount);
              const maxBlocks = maxAllowedDec
                .div(redemptionValueDec)
                .floor()
                .toNumber();
              redeemedPoints = maxBlocks * settings.loyaltyRedemptionPoints;
              loyaltyDiscount = redemptionValueDec.mul(maxBlocks).toNumber();
            }

            if (redeemedPoints > customer.loyaltyPoints) {
              const maxCustBlocks = Math.floor(
                customer.loyaltyPoints / settings.loyaltyRedemptionPoints,
              );
              redeemedPoints = maxCustBlocks * settings.loyaltyRedemptionPoints;
              loyaltyDiscount = redemptionValueDec
                .mul(maxCustBlocks)
                .toNumber();
            }
          }
        }
      }

      // Recalculate complete final bill using shared calculation service
      const calcResult = this.calcService.calculate({
        subtotal: Number(order.subtotal),
        manualDiscount: Number(bill.manualDiscount),
        couponDiscount,
        loyaltyDiscount,
        settings,
        applyNightChargeOverride: Number(order.nightCharge) > 0,
      });

      // Generate sequence-safe unique invoice number
      const year = new Date().getFullYear();
      const prefix = settings.invoicePrefix || 'CCB';

      // Row-locking transactional sequence counter increment
      const seq = await tx.invoiceSequence.upsert({
        where: { year_prefix: { year, prefix } },
        update: { lastNumber: { increment: 1 } },
        create: { year, prefix, lastNumber: 1 },
      });

      const sequenceStr = String(seq.lastNumber).padStart(6, '0');
      const invoiceNumber = `${prefix}-${year}-${sequenceStr}`;

      // Update Bill to FINALIZED with snapshot values
      const finalizedBill = await tx.bill.update({
        where: { id: bill.id },
        data: {
          invoiceNumber,
          status: BillStatus.FINALIZED,
          itemDiscount: 0.0,
          couponDiscount: calcResult.couponDiscount,
          manualDiscount: calcResult.manualDiscount,
          loyaltyDiscount: calcResult.loyaltyDiscount,
          discount: calcResult.discount,
          totalDiscount: calcResult.discount,
          taxableAmount: calcResult.taxableAmount,
          loyaltyEligibleAmount: calcResult.baseTaxableAmount,
          cgst: calcResult.cgst,
          sgst: calcResult.sgst,
          serviceCharge: calcResult.serviceCharge,
          nightCharge: calcResult.nightCharge,
          preRoundGrandTotal: calcResult.preRoundGrandTotal,
          roundOff: calcResult.roundOff,
          grandTotal: calcResult.grandTotal,

          // Snapshots
          gstRateSnapshot: settings.gstPercentage,
          cgstRateSnapshot: settings.cgstPercentage,
          sgstRateSnapshot: settings.sgstPercentage,
          taxInclusiveSnapshot: settings.taxInclusivePricing,
          serviceChargeRateSnapshot: settings.serviceChargePercentage,
          nightChargeTypeSnapshot: settings.nightChargeType,
          nightChargeValueSnapshot: settings.nightChargeValue,

          finalizedAt: new Date(),
        },
      });

      // Sync Order totals and paymentStatus
      await tx.order.update({
        where: { id: order.id },
        data: {
          discount: calcResult.discount,
          couponDiscount: calcResult.couponDiscount,
          taxableAmount: calcResult.taxableAmount,
          cgst: calcResult.cgst,
          sgst: calcResult.sgst,
          serviceCharge: calcResult.serviceCharge,
          nightCharge: calcResult.nightCharge,
          roundOff: calcResult.roundOff,
          grandTotal: calcResult.grandTotal,
        },
      });

      // LOYALTY LEDGER WRITES & BALANCE UPDATES
      if (settings.enableLoyalty && order.customerId) {
        let currentPoints = 0;
        const customer = await tx.customer.findUnique({
          where: { id: order.customerId },
        });
        if (customer) {
          currentPoints = customer.loyaltyPoints;
        }

        // 1. Redeemed Points
        if (redeemedPoints > 0 && redemptionRequest) {
          const newBalanceAfterRedeem = currentPoints - redeemedPoints;
          await tx.customer.update({
            where: { id: order.customerId },
            data: { loyaltyPoints: newBalanceAfterRedeem },
          });

          await tx.loyaltyTransaction.create({
            data: {
              customerId: order.customerId,
              type: LoyaltyTransactionType.REDEEM,
              pointsChange: -redeemedPoints,
              balanceAfter: newBalanceAfterRedeem,
              billId: bill.id,
              orderId: order.id,
              redemptionRequestId: redemptionRequest.id,
              redemptionValueSnapshot: settings.loyaltyRedemptionValue,
              redemptionPointsSnapshot: settings.loyaltyRedemptionPoints,
              idempotencyKey: `LOYALTY_REDEEM:${bill.id}`,
              createdByStaffId: staffId,
            },
          });

          currentPoints = newBalanceAfterRedeem;
        }

        // 2. Earned Points
        const eligibleDec = new Prisma.Decimal(
          finalizedBill.loyaltyEligibleAmount,
        );
        const spendDec = new Prisma.Decimal(settings.loyaltySpendAmount);
        const completeSpendBlocks = eligibleDec
          .div(spendDec)
          .floor()
          .toNumber();
        const earnedPoints = completeSpendBlocks * settings.loyaltyPointsEarned;

        if (earnedPoints > 0) {
          const newBalanceAfterEarn = currentPoints + earnedPoints;
          await tx.customer.update({
            where: { id: order.customerId },
            data: { loyaltyPoints: newBalanceAfterEarn },
          });

          await tx.loyaltyTransaction.create({
            data: {
              customerId: order.customerId,
              type: LoyaltyTransactionType.EARN,
              pointsChange: earnedPoints,
              balanceAfter: newBalanceAfterEarn,
              billId: bill.id,
              orderId: order.id,
              eligibleAmountSnapshot: finalizedBill.loyaltyEligibleAmount,
              earnSpendAmountSnapshot: settings.loyaltySpendAmount,
              earnPointsSnapshot: settings.loyaltyPointsEarned,
              idempotencyKey: `LOYALTY_EARN:${bill.id}`,
              createdByStaffId: staffId,
            },
          });
        }
      }

      return finalizedBill;
    });
  }

  async validateCoupon(code: string, subtotal: number, customerId?: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code },
    });

    if (!coupon || !coupon.isActive) {
      return { isValid: false, message: 'Invalid or inactive coupon code.' };
    }

    const now = new Date();
    if (now < coupon.startDate || now > coupon.endDate) {
      return { isValid: false, message: 'Coupon code has expired.' };
    }

    if (subtotal < Number(coupon.minOrder)) {
      return {
        isValid: false,
        message: `Minimum order value of ₹${coupon.minOrder.toString()} required for this coupon.`,
      };
    }

    // Check total usage limit
    if (coupon.usageLimit) {
      const totalUsage = await this.prisma.couponUsage.count({
        where: { couponId: coupon.id },
      });
      if (totalUsage >= coupon.usageLimit) {
        return {
          isValid: false,
          message: 'Coupon usage limit has been reached.',
        };
      }
    }

    // Check per-customer usage limit
    if (customerId && coupon.perCustLimit !== null) {
      const custUsage = await this.prisma.couponUsage.count({
        where: { couponId: coupon.id, customerId },
      });
      if (custUsage >= coupon.perCustLimit) {
        return {
          isValid: false,
          message: 'You have exceeded the usage limit for this coupon.',
        };
      }
    }

    // Calculate coupon discount estimate
    let discount = 0;
    if (coupon.type === 'FLAT') {
      discount = Number(coupon.value);
    } else {
      discount = this.calcService.roundToTwo(
        (subtotal * Number(coupon.value)) / 100,
      );
      if (coupon.maxDiscount) {
        discount = Math.min(discount, Number(coupon.maxDiscount));
      }
    }

    return {
      isValid: true,
      couponId: coupon.id,
      discount,
      message: 'Coupon code successfully validated!',
    };
  }
}
