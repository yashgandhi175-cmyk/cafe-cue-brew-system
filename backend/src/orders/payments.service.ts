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
  OrderStatus,
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
      creditType?: 'UNTIL_PAY' | 'WEEKLY' | 'FIFTEEN_DAYS' | 'MONTHLY' | 'CUSTOM';
      dueDate?: string;
      notes?: string;
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

        // 4. Sync live session items total to bill if session exists
        let liveGrandTotal = Number(bill.grandTotal);
        if (bill.tableSessionId && typeof tx.order?.findMany === 'function') {
          const sessionOrders = await tx.order.findMany({
            where: {
              tableSessionId: bill.tableSessionId,
              status: { notIn: ['CANCELLED', 'VOIDED'] },
            },
            include: { items: true },
          }).catch(() => []);

          const sessionSubtotal = (sessionOrders as any[]).reduce((sum: number, so: any) => {
            const itemSum = (so.items || []).reduce((iSum: number, item: any) => iSum + Number(item.totalPrice || 0), 0);
            return sum + (itemSum || Number(so.subtotal || 0));
          }, 0);

          if (Number(sessionSubtotal) > 0) {
            const calcResult = this.calcService.calculate({
              subtotal: Number(sessionSubtotal),
              manualDiscount: Number(bill.manualDiscount),
              couponDiscount: Number(bill.couponDiscount),
              loyaltyDiscount: Number(bill.loyaltyDiscount),
              settings,
            });
            liveGrandTotal = Number(calcResult.grandTotal);

            if (Number(bill.grandTotal) !== liveGrandTotal) {
              await tx.bill.update({
                where: { id: bill.id },
                data: {
                  subtotal: calcResult.subtotal,
                  taxableAmount: calcResult.taxableAmount,
                  cgst: calcResult.cgst,
                  sgst: calcResult.sgst,
                  serviceCharge: calcResult.serviceCharge,
                  nightCharge: calcResult.nightCharge,
                  roundOff: calcResult.roundOff,
                  grandTotal: calcResult.grandTotal,
                },
              });
              bill.grandTotal = liveGrandTotal as any;
            }
          }
        }

        // Calculate Authoritative Balance (only counting actual settled payments)
        const existingSettledPayments = bill.tableSessionId
          ? await tx.payment.findMany({
              where: {
                order: { tableSessionId: bill.tableSessionId },
                status: PaymentStatusDetail.COMPLETED,
                isSettled: true,
              },
            })
          : await tx.payment.findMany({
              where: { billId: bill.id, status: PaymentStatusDetail.COMPLETED, isSettled: true },
            });

        const totalSettledSum = existingSettledPayments
          .reduce((sum, p) => sum + Number(p.amount), 0);

        const grandTotal = Number(bill.grandTotal);
        const outstanding = this.calcService.roundToTwo(
          grandTotal - totalSettledSum,
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

        // 7.5 If method is CREDIT, create or update a CreditLedger entry idempotently
        if (dto.method === PaymentMethod.CREDIT) {
          if (!bill.order.customerId) {
            throw new BadRequestException(
              'A registered customer with a profile is required to settle on credit.',
            );
          }

          let calculatedDueDate: Date | null = null;
          const creditType = dto.creditType || 'UNTIL_PAY';
          if (creditType === 'WEEKLY') {
            calculatedDueDate = new Date();
            calculatedDueDate.setDate(calculatedDueDate.getDate() + 7);
          } else if (creditType === 'FIFTEEN_DAYS') {
            calculatedDueDate = new Date();
            calculatedDueDate.setDate(calculatedDueDate.getDate() + 15);
          } else if (creditType === 'MONTHLY') {
            calculatedDueDate = new Date();
            calculatedDueDate.setDate(calculatedDueDate.getDate() + 30);
          } else if (creditType === 'CUSTOM') {
            calculatedDueDate = dto.dueDate ? new Date(dto.dueDate) : null;
          } else {
            // UNTIL_PAY: No fixed due date required
            calculatedDueDate = null;
          }

          const targetInvoiceNumber = bill.invoiceNumber || `INV-${bill.id.substring(0, 8).toUpperCase()}`;

          const existingLedger = await tx.creditLedger.findUnique({
            where: { invoiceNumber: targetInvoiceNumber },
          });

          if (existingLedger) {
            await tx.creditLedger.update({
              where: { id: existingLedger.id },
              data: {
                outstandingAmount: finalSettledAmount,
                dueDate: calculatedDueDate,
                notes: dto.notes || existingLedger.notes,
                updatedById: staffId,
              },
            });
          } else {
            await tx.creditLedger.create({
              data: {
                customerId: bill.order.customerId,
                invoiceNumber: targetInvoiceNumber,
                invoiceDate: bill.finalizedAt || new Date(),
                billAmount: bill.grandTotal,
                outstandingAmount: finalSettledAmount,
                dueDate: calculatedDueDate,
                creditType: creditType,
                notes: dto.notes || null,
                settlementStatus: 'UNPAID',
                createdById: staffId,
                updatedById: staffId,
              },
            });
          }
        } else {
          // If paying off an outstanding credit bill with Cash/UPI/Card, update any associated CreditLedger entries
          if (bill.order?.customerId) {
            const creditEntry = await tx.creditLedger.findFirst({
              where: {
                customerId: bill.order.customerId,
                invoiceNumber: bill.invoiceNumber || undefined,
                settlementStatus: { in: ['UNPAID', 'PARTIAL'] },
              },
            });
            if (creditEntry) {
              const remCredit = Math.max(0, Number(creditEntry.outstandingAmount) - finalSettledAmount);
              await tx.creditLedger.update({
                where: { id: creditEntry.id },
                data: {
                  outstandingAmount: remCredit,
                  settlementStatus: remCredit <= 0 ? 'PAID' : 'PARTIAL',
                  updatedById: staffId,
                },
              });
            }
          }
        }

        // 8. Re-evaluate overall payments
        const allSettledPayments = bill.tableSessionId
          ? await tx.payment.findMany({
              where: {
                order: { tableSessionId: bill.tableSessionId },
                status: PaymentStatusDetail.COMPLETED,
                isSettled: true,
              },
            })
          : await tx.payment.findMany({
              where: { billId: bill.id, status: PaymentStatusDetail.COMPLETED, isSettled: true },
            });

        const finalSettledSum = allSettledPayments
          .reduce((sum, p) => sum + Number(p.amount), 0);

        const creditPayments = bill.tableSessionId
          ? await tx.payment.findMany({
              where: {
                order: { tableSessionId: bill.tableSessionId },
                method: PaymentMethod.CREDIT,
              },
            })
          : await tx.payment.findMany({
              where: { billId: bill.id, method: PaymentMethod.CREDIT },
            });
        const hasCreditPayment = creditPayments.length > 0;

        let finalPaymentStatus: PaymentStatus = PaymentStatus.UNPAID;
        let finalBillStatus: BillStatus = BillStatus.FINALIZED;

        const outstandingVal = Math.max(0, this.calcService.roundToTwo(grandTotal - finalSettledSum));

        if (outstandingVal === 0 && grandTotal > 0) {
          finalPaymentStatus = PaymentStatus.PAID;
          finalBillStatus = BillStatus.PAID;
        } else if (finalSettledSum > 0 && outstandingVal > 0) {
          finalPaymentStatus = PaymentStatus.PARTIAL;
          finalBillStatus = BillStatus.FINALIZED;
        } else if (hasCreditPayment && outstandingVal > 0) {
          finalPaymentStatus = PaymentStatus.CREDIT;
          finalBillStatus = BillStatus.FINALIZED;
        } else {
          finalPaymentStatus = PaymentStatus.UNPAID;
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
        if (bill.tableSessionId) {
          await tx.order.updateMany({
            where: { tableSessionId: bill.tableSessionId },
            data: {
              paymentStatus: finalPaymentStatus,
            },
          });
        } else {
          await tx.order.update({
            where: { id: bill.orderId },
            data: {
              paymentStatus: finalPaymentStatus,
            },
          });
        }

        // 8.5 Close TableSession & Release table & Clear cart & Complete orders if bill is fully closed/settled
        if (finalBillStatus === BillStatus.PAID) {
          if (bill.tableSessionId) {
            await tx.order.updateMany({
              where: {
                tableSessionId: bill.tableSessionId,
                status: { notIn: [OrderStatus.CANCELLED, OrderStatus.VOIDED] },
              },
              data: {
                status: OrderStatus.COMPLETED,
              },
            });

            await tx.tableSession.update({
              where: { id: bill.tableSessionId },
              data: {
                status: 'CLOSED',
                closedAt: new Date(),
              },
            });
          } else if (bill.orderId) {
            await tx.order.update({
              where: { id: bill.orderId },
              data: {
                status: OrderStatus.COMPLETED,
              },
            });
          }

          if (bill.order.tableId) {
            await tx.restaurantTable.update({
              where: { id: bill.order.tableId },
              data: { status: 'AVAILABLE' },
            });

            // Clear Customer Cart
            await tx.customerCart.deleteMany({
              where: { tableId: bill.order.tableId },
            });
          }
        }

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
