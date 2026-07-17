import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { FinancialCalculationService } from './financial-calculation.service';
import {
  Role,
  BillStatus,
  PaymentStatus,
  PaymentMethod,
  PaymentStatusDetail,
} from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private calcService: FinancialCalculationService,
  ) {}

  async recordPayment(
    staffId: string,
    staffRole: Role,
    dto: {
      billId: string;
      method: PaymentMethod;
      amount: number;
      amountTendered?: number;
      reference?: string;
      paymentIdempotencyKey?: string;
    },
  ) {
    if (staffRole === Role.WAITER) {
      throw new BadRequestException(
        'Waiters are not authorized to record payments.',
      );
    }

    if (dto.amount <= 0) {
      throw new BadRequestException(
        'Payment amount must be greater than zero.',
      );
    }

    // 1. Payment Idempotency Check
    if (dto.paymentIdempotencyKey) {
      const existingPayment = await this.prisma.payment.findUnique({
        where: { paymentIdempotencyKey: dto.paymentIdempotencyKey },
        include: { splitPayments: true },
      });
      if (existingPayment) {
        return existingPayment;
      }
    }

    // Wrap in safe interactive transaction
    try {
      return await this.prisma.$transaction(async (tx) => {
        // 2. Load Bill & settings
        const bill = await tx.bill.findUnique({
          where: { id: dto.billId },
          include: { order: true },
        });

        if (!bill) {
          throw new NotFoundException('Bill not found.');
        }

        if (bill.status === BillStatus.VOIDED) {
          throw new BadRequestException(
            'Cannot record payment for a voided bill.',
          );
        }

        if (bill.status === BillStatus.DRAFT) {
          throw new BadRequestException(
            'Cannot record payment for an unfinalized draft bill.',
          );
        }

        const settings = await tx.restaurantSettings.findUnique({
          where: { id: 'default' },
        });

        if (!settings) {
          throw new NotFoundException('Restaurant settings not found.');
        }

        // 3. Verify Payment Method settings
        if (dto.method === PaymentMethod.CASH && !settings.enableCash) {
          throw new BadRequestException(
            'Cash payments are currently disabled.',
          );
        }
        if (dto.method === PaymentMethod.UPI && !settings.enableUpi) {
          throw new BadRequestException('UPI payments are currently disabled.');
        }
        if (dto.method === PaymentMethod.CARD && !settings.enableCard) {
          throw new BadRequestException(
            'Card payments are currently disabled.',
          );
        }
        if (dto.method === PaymentMethod.CREDIT && !settings.enableCredit) {
          throw new BadRequestException('Credit is currently disabled.');
        }

        // 4. Calculate Authoritative Balance
        const existingPayments = await tx.payment.findMany({
          where: { billId: bill.id, status: PaymentStatusDetail.COMPLETED },
        });

        const settledSum = existingPayments
          .filter((p) => p.isSettled)
          .reduce((sum, p) => sum + Number(p.amount), 0);

        const grandTotal = Number(bill.grandTotal);
        const outstanding = this.calcService.roundToTwo(
          grandTotal - settledSum,
        );

        if (outstanding <= 0) {
          throw new BadRequestException(
            'This bill has already been fully settled.',
          );
        }

        // 5. Determine settled vs tendered amounts
        let finalSettledAmount = dto.amount;
        let amountTenderedVal: number | null = null;
        let changeDueVal: number | null = null;
        const isSettled = dto.method !== PaymentMethod.CREDIT;

        if (dto.method === PaymentMethod.CASH) {
          const tenderedInput =
            dto.amountTendered !== undefined ? dto.amountTendered : dto.amount;
          amountTenderedVal = tenderedInput;

          if (tenderedInput < dto.amount) {
            throw new BadRequestException(
              'Tendered cash cannot be less than the payment amount.',
            );
          }

          if (dto.amount > outstanding) {
            // Overpayment capping (Correction 3)
            finalSettledAmount = outstanding;
            changeDueVal = this.calcService.roundToTwo(
              tenderedInput - outstanding,
            );
          } else {
            finalSettledAmount = dto.amount;
            changeDueVal = this.calcService.roundToTwo(
              tenderedInput - dto.amount,
            );
          }
        } else {
          // Card, UPI, Credit overpayment checks (must not exceed outstanding)
          if (dto.amount > outstanding) {
            throw new BadRequestException(
              `Payment amount cannot exceed the outstanding balance of ₹${outstanding}.`,
            );
          }
        }

        // 6. Final Payment Concurrency Strategy (Version Lock checking)
        const updatedBillCount = await tx.bill.updateMany({
          where: {
            id: bill.id,
            financialVersion: bill.financialVersion,
          },
          data: {
            financialVersion: { increment: 1 },
          },
        });

        if (updatedBillCount.count === 0) {
          throw new ConflictException(
            'A concurrent transaction has updated this bill. Please retry.',
          );
        }

        // 7. Create Payment record
        const payment = await tx.payment.create({
          data: {
            orderId: bill.orderId,
            billId: bill.id,
            method: dto.method,
            amount: finalSettledAmount,
            amountTendered: amountTenderedVal,
            changeDue: changeDueVal,
            reference: dto.reference,
            status: PaymentStatusDetail.COMPLETED,
            isSettled,
            receivedById: staffId,
            paymentIdempotencyKey: dto.paymentIdempotencyKey,
          },
        });

        // 8. Re-evaluate overall payments
        const allPayments = await tx.payment.findMany({
          where: { billId: bill.id, status: PaymentStatusDetail.COMPLETED },
        });

        const finalSettledSum = allPayments
          .filter((p) => p.isSettled)
          .reduce((sum, p) => sum + Number(p.amount), 0);

        let finalPaymentStatus: PaymentStatus = PaymentStatus.UNPAID;
        let finalBillStatus: BillStatus = BillStatus.FINALIZED;

        if (finalSettledSum >= grandTotal) {
          finalPaymentStatus = PaymentStatus.PAID;
          finalBillStatus = BillStatus.PAID;
        } else if (finalSettledSum > 0) {
          finalPaymentStatus = PaymentStatus.PARTIALLY_PAID;
          finalBillStatus = BillStatus.FINALIZED;
        }

        // Unexpected integrity check (Correction 3)
        if (finalSettledSum > grandTotal) {
          throw new ConflictException(
            'Financial integrity check failed: settled payments exceed grand total.',
          );
        }

        // Update Bill statuses
        await tx.bill.update({
          where: { id: bill.id },
          data: {
            paymentStatus: finalPaymentStatus,
            status: finalBillStatus,
          },
        });

        // Sync to Order
        await tx.order.update({
          where: { id: bill.orderId },
          data: {
            paymentStatus: finalPaymentStatus,
          },
        });

        // AuditLog
        await tx.auditLog.create({
          data: {
            staffId,
            action: 'PAYMENT_CREATE',
            entityType: 'Payment',
            entityId: payment.id,
            newData: JSON.stringify({
              method: dto.method,
              amount: finalSettledAmount,
              isSettled,
              paymentStatus: finalPaymentStatus,
            }),
          },
        });

        return payment;
      });
    } catch (error) {
      // Handle concurrent P2002 duplicate payment keys safely
      if (
        error instanceof Error &&
        (error as any).code === 'P2002' &&
        dto.paymentIdempotencyKey
      ) {
        const doubleCheckPayment = await this.prisma.payment.findUnique({
          where: { paymentIdempotencyKey: dto.paymentIdempotencyKey },
        });
        if (doubleCheckPayment) {
          return doubleCheckPayment;
        }
      }
      throw error;
    }
  }
}
