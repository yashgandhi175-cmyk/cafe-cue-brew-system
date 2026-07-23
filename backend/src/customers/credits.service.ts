import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { SettlementStatus, CreditType, PaymentMethod } from '@prisma/client';

@Injectable()
export class CreditsService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. Get Summary of Customer Credits (List Customers First)
  async getCreditsSummary(search?: string) {
    const whereClause: any = {};
    if (search) {
      whereClause.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        {
          creditLedgers: {
            some: {
              invoiceNumber: { contains: search },
            },
          },
        },
      ];
    }

    const customers = await this.prisma.customer.findMany({
      where: whereClause,
      include: {
        creditLedgers: {
          include: {
            payments: {
              orderBy: { paidAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const now = new Date();

    return customers
      .map((customer) => {
        const ledgers = customer.creditLedgers;
        const activeLedgers = ledgers.filter((l) => l.settlementStatus !== 'PAID');
        if (ledgers.length === 0) return null;

        const outstandingAmount = activeLedgers.reduce(
          (sum, ledger) => sum + Number(ledger.outstandingAmount),
          0,
        );

        let overdueAmount = 0;
        let maxOverdueDays = 0;

        activeLedgers.forEach((ledger) => {
          if (ledger.dueDate && ledger.dueDate < now) {
            const diffTime = Math.abs(now.getTime() - ledger.dueDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            overdueAmount += Number(ledger.outstandingAmount);
            if (diffDays > maxOverdueDays) {
              maxOverdueDays = diffDays;
            }
          }
        });

        // Find last payment date across all ledgers
        let lastPaymentDate: Date | null = null;
        ledgers.forEach((l) => {
          if (l.payments.length > 0) {
            const pDate = l.payments[0].paidAt;
            if (!lastPaymentDate || pDate > lastPaymentDate) {
              lastPaymentDate = pDate;
            }
          }
        });

        return {
          customerId: customer.id,
          name: customer.name,
          phone: customer.phone,
          outstandingAmount,
          overdueAmount,
          openInvoicesCount: activeLedgers.length,
          overdueDays: maxOverdueDays,
          lastPaymentDate,
          status: overdueAmount > 0 ? 'OVERDUE' : (outstandingAmount > 0 ? 'ACTIVE' : 'CLEARED'),
        };
      })
      .filter(Boolean);
  }

  // 2. Get Detailed Customer Credit Ledger
  async getCustomerCreditDetails(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        creditLedgers: {
          include: {
            payments: {
              include: {
                receivedBy: {
                  select: { id: true, name: true },
                },
              },
              orderBy: { paidAt: 'desc' },
            },
          },
          orderBy: [{ dueDate: 'asc' }, { invoiceDate: 'desc' }],
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const now = new Date();
    const timeline: any[] = [];
    let totalOutstanding = 0;
    let totalPaid = 0;
    let overdueAmount = 0;
    let oldestDueDate: Date | null = null;
    let lastPaymentDate: Date | null = null;
    let totalPeriodDays = 0;
    let paidCount = 0;

    customer.creditLedgers.forEach((ledger) => {
      const ledgerOutstanding = Number(ledger.outstandingAmount);
      const ledgerBillAmount = Number(ledger.billAmount);
      const ledgerPaid = ledgerBillAmount - ledgerOutstanding;

      totalOutstanding += ledgerOutstanding;
      totalPaid += ledgerPaid;

      if (ledger.settlementStatus !== 'PAID') {
        if (ledger.dueDate && ledger.dueDate < now) {
          overdueAmount += ledgerOutstanding;
        }
        if (ledger.dueDate && (!oldestDueDate || ledger.dueDate < oldestDueDate)) {
          oldestDueDate = ledger.dueDate;
        }
      }

      // Add invoice created event
      timeline.push({
        type: 'INVOICE_CREATED',
        date: ledger.invoiceDate,
        description: `Invoice ${ledger.invoiceNumber} created on Credit`,
        amount: ledgerBillAmount,
        outstanding: ledgerOutstanding,
        meta: { ledgerId: ledger.id, invoiceNumber: ledger.invoiceNumber },
      });

      // Add payment events
      ledger.payments.forEach((payment) => {
        const pDate = payment.paidAt;
        if (!lastPaymentDate || pDate > lastPaymentDate) {
          lastPaymentDate = pDate;
        }

        const diffTime = Math.abs(pDate.getTime() - ledger.invoiceDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        totalPeriodDays += diffDays;
        paidCount++;

        timeline.push({
          type: 'PAYMENT_RECEIVED',
          date: payment.paidAt,
          description: `Received payment of ₹${payment.amount} via ${payment.method} against ${ledger.invoiceNumber}`,
          amount: Number(payment.amount),
          receivedBy: payment.receivedBy?.name || 'Staff',
          meta: { paymentId: payment.id, ledgerId: ledger.id, invoiceNumber: ledger.invoiceNumber },
        });
      });
    });

    timeline.sort((a, b) => b.date.getTime() - a.date.getTime());

    const openInvoicesCount = customer.creditLedgers.filter((l) => l.settlementStatus !== 'PAID').length;
    const averageCollectionDays = paidCount > 0 ? Math.round(totalPeriodDays / paidCount) : 0;
    const creditLimit = 50000;
    const availableCredit = Math.max(0, creditLimit - totalOutstanding);

    const invoices = customer.creditLedgers.map((l) => {
      const paidAmount = Number(l.billAmount) - Number(l.outstandingAmount);
      const isOverdue = l.dueDate ? now > new Date(l.dueDate) && l.settlementStatus !== 'PAID' : false;
      let daysOverdue = 0;
      if (isOverdue && l.dueDate) {
        const diffTime = Math.abs(now.getTime() - new Date(l.dueDate).getTime());
        daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      return {
        id: l.id,
        invoiceNumber: l.invoiceNumber,
        invoiceDate: l.invoiceDate,
        billAmount: Number(l.billAmount),
        paidAmount,
        outstandingAmount: Number(l.outstandingAmount),
        dueDate: l.dueDate,
        creditType: l.creditType,
        settlementStatus: isOverdue ? 'OVERDUE' : l.settlementStatus,
        notes: l.notes,
        overdue: isOverdue,
        daysOverdue,
      };
    });

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        creditLimit,
        availableCredit,
        totalOutstanding,
        totalPaid,
        openInvoicesCount,
        overdueAmount,
        oldestDueDate,
        averageCollectionDays,
        lastPaymentDate,
      },
      invoices,
      timeline,
    };
  }

  // 3. Receive Credit Payment (Supports TOTAL_PAY FIFO distribution or single invoice payment)
  async recordCreditPayment(
    customerId: string | null,
    ledgerId: string | null,
    amount: number,
    method: PaymentMethod,
    reference: string | null,
    staffId: string,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero.');
    }

    return this.prisma.$transaction(async (tx) => {
      // MODE A: Specific Ledger ID (and NOT TOTAL_PAY)
      if (ledgerId && ledgerId !== 'TOTAL_PAY') {
        const ledger = await tx.creditLedger.findUnique({
          where: { id: ledgerId },
        });

        if (!ledger) {
          throw new NotFoundException('Credit ledger entry not found.');
        }

        const outstanding = Number(ledger.outstandingAmount);
        if (outstanding <= 0) {
          throw new BadRequestException('This invoice has already been fully paid.');
        }

        if (amount > outstanding) {
          throw new BadRequestException(
            `Payment amount (₹${amount}) cannot exceed outstanding balance of ₹${outstanding}.`,
          );
        }

        const newOutstanding = Math.max(0, outstanding - amount);
        const nextStatus: SettlementStatus = newOutstanding === 0 ? 'PAID' : 'PARTIAL';

        const payment = await tx.creditPayment.create({
          data: {
            creditLedgerId: ledger.id,
            amount,
            method,
            reference,
            receivedById: staffId,
          },
        });

        await tx.creditLedger.update({
          where: { id: ledger.id },
          data: {
            outstandingAmount: newOutstanding,
            settlementStatus: nextStatus,
            updatedById: staffId,
          },
        });

        // Sync to Bill & Order
        const bill = await tx.bill.findUnique({
          where: { invoiceNumber: ledger.invoiceNumber },
        });
        if (bill) {
          await tx.bill.update({
            where: { id: bill.id },
            data: {
              paymentStatus: nextStatus === 'PAID' ? 'PAID' : 'PARTIAL',
              status: nextStatus === 'PAID' ? 'PAID' : 'FINALIZED',
            },
          });
          if (bill.tableSessionId) {
            await tx.order.updateMany({
              where: { tableSessionId: bill.tableSessionId },
              data: { paymentStatus: nextStatus === 'PAID' ? 'PAID' : 'PARTIAL' },
            });
          } else if (bill.orderId) {
            await tx.order.update({
              where: { id: bill.orderId },
              data: { paymentStatus: nextStatus === 'PAID' ? 'PAID' : 'PARTIAL' },
            });
          }
        }

        await tx.auditLog.create({
          data: {
            staffId,
            action: 'CREDIT_PAYMENT_RECEIVE',
            entityType: 'CreditPayment',
            entityId: payment.id,
            newData: JSON.stringify({
              ledgerId: ledger.id,
              amount,
              method,
              newOutstanding,
              status: nextStatus,
            }),
          },
        });

        return [payment];
      }

      // MODE B: Total Pay (FIFO Distribution across customer's open invoices)
      let targetCustomerId = customerId;
      if (!targetCustomerId && ledgerId) {
        const singleL = await tx.creditLedger.findUnique({ where: { id: ledgerId } });
        if (singleL) targetCustomerId = singleL.customerId;
      }

      if (!targetCustomerId) {
        throw new BadRequestException('Customer ID is required to process total payment.');
      }

      const activeLedgers = await tx.creditLedger.findMany({
        where: {
          customerId: targetCustomerId,
          settlementStatus: { in: ['UNPAID', 'PARTIAL'] },
        },
        orderBy: [
          { dueDate: 'asc' },
          { invoiceDate: 'asc' },
        ],
      });

      if (activeLedgers.length === 0) {
        throw new BadRequestException('This customer has no outstanding credit invoices.');
      }

      const totalCustomerOutstanding = activeLedgers.reduce(
        (sum, l) => sum + Number(l.outstandingAmount),
        0,
      );

      if (amount > totalCustomerOutstanding) {
        throw new BadRequestException(
          `Payment amount (₹${amount}) cannot exceed total customer outstanding balance of ₹${totalCustomerOutstanding}.`,
        );
      }

      let remainingToAllocate = amount;
      const createdPayments: any[] = [];

      for (const ledger of activeLedgers) {
        if (remainingToAllocate <= 0) break;

        const ledgerOutstanding = Number(ledger.outstandingAmount);
        const allocateAmount = Math.min(remainingToAllocate, ledgerOutstanding);
        const newOutstanding = Math.max(0, ledgerOutstanding - allocateAmount);
        const nextStatus: SettlementStatus = newOutstanding === 0 ? 'PAID' : 'PARTIAL';

        const payment = await tx.creditPayment.create({
          data: {
            creditLedgerId: ledger.id,
            amount: allocateAmount,
            method,
            reference,
            receivedById: staffId,
          },
        });
        createdPayments.push(payment);

        await tx.creditLedger.update({
          where: { id: ledger.id },
          data: {
            outstandingAmount: newOutstanding,
            settlementStatus: nextStatus,
            updatedById: staffId,
          },
        });

        // Sync to Bill & Order
        const bill = await tx.bill.findUnique({
          where: { invoiceNumber: ledger.invoiceNumber },
        });
        if (bill) {
          await tx.bill.update({
            where: { id: bill.id },
            data: {
              paymentStatus: nextStatus === 'PAID' ? 'PAID' : 'PARTIAL',
              status: nextStatus === 'PAID' ? 'PAID' : 'FINALIZED',
            },
          });
          if (bill.tableSessionId) {
            await tx.order.updateMany({
              where: { tableSessionId: bill.tableSessionId },
              data: { paymentStatus: nextStatus === 'PAID' ? 'PAID' : 'PARTIAL' },
            });
          } else if (bill.orderId) {
            await tx.order.update({
              where: { id: bill.orderId },
              data: { paymentStatus: nextStatus === 'PAID' ? 'PAID' : 'PARTIAL' },
            });
          }
        }

        await tx.auditLog.create({
          data: {
            staffId,
            action: 'CREDIT_PAYMENT_RECEIVE',
            entityType: 'CreditPayment',
            entityId: payment.id,
            newData: JSON.stringify({
              ledgerId: ledger.id,
              amount: allocateAmount,
              method,
              newOutstanding,
              status: nextStatus,
            }),
          },
        });

        remainingToAllocate -= allocateAmount;
      }

      return createdPayments;
    });
  }

  // 4. Get Credit & Aging Analytics for Dashboard
  async getCreditAnalytics() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Start of last 7 days
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    // Start of last 30 days
    const startOfMonthly = new Date();
    startOfMonthly.setDate(startOfMonthly.getDate() - 30);

    const activeLedgers = await this.prisma.creditLedger.findMany({
      where: {
        settlementStatus: { in: ['UNPAID', 'PARTIAL'] },
      },
      include: {
        customer: true,
      },
    });

    const totalOutstanding = activeLedgers.reduce(
      (sum, l) => sum + Number(l.outstandingAmount),
      0,
    );

    // Today's new credit sales
    const todaysNewCreditSalesList = await this.prisma.creditLedger.findMany({
      where: {
        creditDate: { gte: startOfToday },
      },
    });
    const todaysCreditSales = todaysNewCreditSalesList.reduce(
      (sum, l) => sum + Number(l.billAmount),
      0,
    );

    // Today's credit collections
    const todaysCollectionsList = await this.prisma.creditPayment.findMany({
      where: {
        paidAt: { gte: startOfToday },
      },
    });
    const todaysCreditCollections = todaysCollectionsList.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );

    // Weekly Collections
    const weeklyCollectionsList = await this.prisma.creditPayment.findMany({
      where: {
        paidAt: { gte: startOfWeek },
      },
    });
    const weeklyCollections = weeklyCollectionsList.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );

    // Monthly Collections
    const monthlyCollectionsList = await this.prisma.creditPayment.findMany({
      where: {
        paidAt: { gte: startOfMonthly },
      },
    });
    const monthlyCollections = monthlyCollectionsList.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );

    // Overdue Customers Count
    const overdueLedgers = activeLedgers.filter((l) => l.dueDate && l.dueDate < now);
    const overdueCustomersSet = new Set(overdueLedgers.map((l) => l.customerId));
    const overdueCustomers = overdueCustomersSet.size;

    // Largest Outstanding Customer
    const customerOutstandingMap: Record<string, { name: string; outstanding: number }> = {};
    activeLedgers.forEach((l) => {
      const cId = l.customerId;
      if (!customerOutstandingMap[cId]) {
        customerOutstandingMap[cId] = { name: l.customer.name, outstanding: 0 };
      }
      customerOutstandingMap[cId].outstanding += Number(l.outstandingAmount);
    });

    let largestOutstandingCustomer = 'None';
    let largestOutstandingAmount = 0;
    Object.values(customerOutstandingMap).forEach((c) => {
      if (c.outstanding > largestOutstandingAmount) {
        largestOutstandingAmount = c.outstanding;
        largestOutstandingCustomer = `${c.name} (Rs. ${c.outstanding})`;
      }
    });

    // Average Credit Period (resolved invoices)
    const paidLedgers = await this.prisma.creditLedger.findMany({
      where: { settlementStatus: 'PAID' },
      include: {
        payments: {
          orderBy: { paidAt: 'desc' },
          take: 1,
        },
      },
    });

    let totalPeriodDays = 0;
    let paidCount = 0;

    paidLedgers.forEach((l) => {
      if (l.payments.length > 0) {
        const paidDate = l.payments[0].paidAt;
        const diffTime = Math.abs(paidDate.getTime() - l.invoiceDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        totalPeriodDays += diffDays;
        paidCount++;
      }
    });

    const averageCreditPeriod = paidCount > 0 ? Math.round(totalPeriodDays / paidCount) : 0;

    // Build summary map for dashboard charts
    const customerSummaries = Object.entries(customerOutstandingMap).map(
      ([id, val]) => ({
        id,
        name: val.name,
        outstanding: val.outstanding,
      }),
    );

    return {
      totalOutstanding,
      todaysCreditSales,
      todaysCreditCollections,
      weeklyCollections,
      monthlyCollections,
      overdueCustomers,
      largestOutstandingCustomer,
      averageCreditPeriod,
      customerSummaries,
    };
  }
}
