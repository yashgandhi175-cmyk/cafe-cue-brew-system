import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { SettlementStatus, CreditType, PaymentMethod } from '@prisma/client';

@Injectable()
export class CreditsService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. Get Summary of Customer Credits (for report table)
  async getCreditsSummary(search?: string) {
    const whereClause: any = {};
    if (search) {
      whereClause.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const customers = await this.prisma.customer.findMany({
      where: whereClause,
      include: {
        creditLedgers: {
          where: {
            settlementStatus: { in: ['UNPAID', 'PARTIAL'] },
          },
        },
      },
    });

    const now = new Date();

    return customers
      .map((customer) => {
        const activeLedgers = customer.creditLedgers;
        if (activeLedgers.length === 0) return null;

        const outstandingAmount = activeLedgers.reduce(
          (sum, ledger) => sum + Number(ledger.outstandingAmount),
          0,
        );

        let maxOverdueDays = 0;
        activeLedgers.forEach((ledger) => {
          if (ledger.dueDate && ledger.dueDate < now) {
            const diffTime = Math.abs(now.getTime() - ledger.dueDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > maxOverdueDays) {
              maxOverdueDays = diffDays;
            }
          }
        });

        return {
          customerId: customer.id,
          name: customer.name,
          phone: customer.phone,
          outstandingAmount,
          invoiceCount: activeLedgers.length,
          overdueDays: maxOverdueDays,
          status: maxOverdueDays > 0 ? 'OVERDUE' : 'ACTIVE',
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
          orderBy: { invoiceDate: 'desc' },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Build timeline events
    const timeline: any[] = [];
    let totalOutstanding = 0;

    customer.creditLedgers.forEach((ledger) => {
      totalOutstanding += Number(ledger.outstandingAmount);

      // Add invoice created event
      timeline.push({
        type: 'INVOICE_CREATED',
        date: ledger.invoiceDate,
        description: `Invoice ${ledger.invoiceNumber} created on Credit`,
        amount: Number(ledger.billAmount),
        outstanding: Number(ledger.outstandingAmount),
        meta: { ledgerId: ledger.id, invoiceNumber: ledger.invoiceNumber },
      });

      // Add payment events
      ledger.payments.forEach((payment) => {
        timeline.push({
          type: 'PAYMENT_RECEIVED',
          date: payment.paidAt,
          description: `Received payment of Rs. ${payment.amount} via ${payment.method} against ${ledger.invoiceNumber}`,
          amount: Number(payment.amount),
          receivedBy: payment.receivedBy.name,
          meta: { paymentId: payment.id, ledgerId: ledger.id, invoiceNumber: ledger.invoiceNumber },
        });
      });
    });

    // Sort timeline chronologically (latest first)
    timeline.sort((a, b) => b.date.getTime() - a.date.getTime());

    const invoices = customer.creditLedgers.map((l) => {
      const paidAmount = Number(l.billAmount) - Number(l.outstandingAmount);
      return {
        id: l.id,
        invoiceNumber: l.invoiceNumber,
        invoiceDate: l.invoiceDate,
        billAmount: Number(l.billAmount),
        paidAmount,
        outstandingAmount: Number(l.outstandingAmount),
        dueDate: l.dueDate,
        creditType: l.creditType,
        settlementStatus: l.settlementStatus,
        notes: l.notes,
        overdue: l.dueDate ? new Date() > new Date(l.dueDate) && l.settlementStatus !== 'PAID' : false,
      };
    });

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        totalOutstanding,
      },
      invoices,
      timeline,
    };
  }

  // 3. Receive Credit Payment (settle fully or partially)
  async recordCreditPayment(
    ledgerId: string,
    amount: number,
    method: PaymentMethod,
    reference: string | null,
    staffId: string,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero.');
    }

    return this.prisma.$transaction(async (tx) => {
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
          `Payment amount (Rs. ${amount}) cannot exceed outstanding balance of Rs. ${outstanding}.`,
        );
      }

      const newOutstanding = outstanding - amount;
      let nextStatus: SettlementStatus = 'PARTIAL';
      if (newOutstanding === 0) {
        nextStatus = 'PAID';
      }

      // 1. Create CreditPayment record
      const payment = await tx.creditPayment.create({
        data: {
          creditLedgerId: ledger.id,
          amount,
          method,
          reference,
          receivedById: staffId,
        },
      });

      // 2. Update CreditLedger
      await tx.creditLedger.update({
        where: { id: ledger.id },
        data: {
          outstandingAmount: newOutstanding,
          settlementStatus: nextStatus,
          updatedById: staffId,
        },
      });

      // 3. Write to Audit Log
      await tx.auditLog.create({
        data: {
          staffId,
          action: 'CREDIT_PAYMENT_RECEIVE',
          entityType: 'CreditPayment',
          entityId: payment.id,
          newData: JSON.stringify({
            ledgerId,
            amount,
            method,
            newOutstanding,
            status: nextStatus,
          }),
        },
      });

      return payment;
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
