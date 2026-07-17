/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { OrderStatus, PaymentMethod, BillStatus, Prisma } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  private readonly eligibleBillStatuses = [
    BillStatus.FINALIZED,
    BillStatus.PAID,
  ];

  constructor(private readonly prisma: PrismaService) {}

  roundToTwo(num: number): number {
    return Math.round((num + Number.EPSILON) * 100) / 100;
  }

  // Helper for Kolkata Timezone range conversions
  getKolkataRange(rangeType: string, customStart?: string, customEnd?: string) {
    const KOLKATA_OFFSET = 5.5 * 60 * 60 * 1000;
    const now = new Date();

    // Current time adjusted to Kolkata timezone
    const nowKolkata = new Date(now.getTime() + KOLKATA_OFFSET);

    let startKolkata = new Date(nowKolkata);
    let endKolkata = new Date(nowKolkata);

    // Set endKolkata to end of day
    endKolkata.setUTCHours(23, 59, 59, 999);

    switch (rangeType) {
      case 'TODAY':
        startKolkata.setUTCHours(0, 0, 0, 0);
        break;
      case 'YESTERDAY':
        startKolkata.setUTCDate(startKolkata.getUTCDate() - 1);
        startKolkata.setUTCHours(0, 0, 0, 0);
        endKolkata.setUTCDate(endKolkata.getUTCDate() - 1);
        break;
      case 'LAST_7_DAYS':
        startKolkata.setUTCDate(startKolkata.getUTCDate() - 6);
        startKolkata.setUTCHours(0, 0, 0, 0);
        break;
      case 'LAST_30_DAYS':
        startKolkata.setUTCDate(startKolkata.getUTCDate() - 29);
        startKolkata.setUTCHours(0, 0, 0, 0);
        break;
      case 'THIS_MONTH':
        startKolkata.setUTCDate(1);
        startKolkata.setUTCHours(0, 0, 0, 0);
        break;
      case 'LAST_MONTH':
        startKolkata.setUTCMonth(startKolkata.getUTCMonth() - 1, 1);
        startKolkata.setUTCHours(0, 0, 0, 0);
        endKolkata.setUTCDate(0); // last day of previous month
        break;
      case 'CUSTOM': {
        if (!customStart || !customEnd) {
          throw new BadRequestException(
            'Start date and End date are required for CUSTOM range.',
          );
        }
        const parsedStart = new Date(customStart);
        const parsedEnd = new Date(customEnd);
        if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
          throw new BadRequestException('Invalid date format.');
        }
        if (parsedStart > parsedEnd) {
          throw new BadRequestException('Start date cannot be after end date.');
        }
        startKolkata = new Date(parsedStart.getTime() + KOLKATA_OFFSET);
        startKolkata.setUTCHours(0, 0, 0, 0);
        endKolkata = new Date(parsedEnd.getTime() + KOLKATA_OFFSET);
        endKolkata.setUTCHours(23, 59, 59, 999);
        break;
      }
      default:
        startKolkata.setUTCHours(0, 0, 0, 0);
    }

    const startDateUtc = new Date(startKolkata.getTime() - KOLKATA_OFFSET);
    const endDateUtc = new Date(endKolkata.getTime() - KOLKATA_OFFSET);

    return { startDateUtc, endDateUtc };
  }

  async getSettingsForGuard() {
    return this.prisma.restaurantSettings.findUnique({
      where: { id: 'default' },
    });
  }

  // 1. Overview KPIs using DB aggregations where possible
  async getOverview(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    // Database Aggregation for Bills
    const billAgg = await this.prisma.bill.aggregate({
      _sum: {
        grandTotal: true,
        discount: true,
        cgst: true,
        sgst: true,
        serviceCharge: true,
        nightCharge: true,
      },
      _count: {
        id: true,
      },
      where: {
        finalizedAt: { gte: startDateUtc, lte: endDateUtc },
        status: { in: this.eligibleBillStatuses },
      },
    });

    // Database Aggregation for Settled Payments (isSettled = true)
    const paymentAgg = await this.prisma.payment.aggregate({
      _sum: {
        amount: true,
      },
      where: {
        paidAt: { gte: startDateUtc, lte: endDateUtc },
        isSettled: true,
      },
    });

    const ordersCount = await this.prisma.order.count({
      where: {
        createdAt: { gte: startDateUtc, lte: endDateUtc },
        status: { not: OrderStatus.VOIDED },
      },
    });

    // Method Breakdown GroupBy
    const paymentGroups = await this.prisma.payment.groupBy({
      by: ['method'],
      _sum: {
        amount: true,
      },
      where: {
        paidAt: { gte: startDateUtc, lte: endDateUtc },
        isSettled: true,
      },
    });

    const billedSales = Number(billAgg._sum.grandTotal || 0);
    const settledCollection = Number(paymentAgg._sum.amount || 0);
    const finalizedCount = billAgg._count.id;
    const averageOrderValue =
      finalizedCount > 0
        ? Number((billedSales / finalizedCount).toFixed(2))
        : 0;

    const cashCollection = Number(
      paymentGroups.find((g) => g.method === PaymentMethod.CASH)?._sum.amount ||
        0,
    );
    const upiCollection = Number(
      paymentGroups.find((g) => g.method === PaymentMethod.UPI)?._sum.amount ||
        0,
    );
    const cardCollection = Number(
      paymentGroups.find((g) => g.method === PaymentMethod.CARD)?._sum.amount ||
        0,
    );

    const outstanding = Math.max(0, billedSales - settledCollection);

    // Credit-classified Bills outstanding sum (Credit Due)
    const creditBills = await this.prisma.bill.findMany({
      where: {
        finalizedAt: { gte: startDateUtc, lte: endDateUtc },
        status: { in: this.eligibleBillStatuses },
        payments: {
          some: {
            method: PaymentMethod.CREDIT,
            isSettled: false,
          },
        },
      },
      include: {
        payments: true,
      },
    });

    let creditDue = 0;
    creditBills.forEach((b) => {
      const settledSum = b.payments
        .filter((p) => p.isSettled)
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const billOutstanding = Math.max(0, Number(b.grandTotal) - settledSum);
      creditDue += billOutstanding;
    });

    const gstCollected =
      Number(billAgg._sum.cgst || 0) + Number(billAgg._sum.sgst || 0);
    const cgst = Number(billAgg._sum.cgst || 0);
    const sgst = Number(billAgg._sum.sgst || 0);
    const discountsGiven = Number(billAgg._sum.discount || 0);
    const serviceCharge = Number(billAgg._sum.serviceCharge || 0);
    const nightCharge = Number(billAgg._sum.nightCharge || 0);

    return {
      billedSales,
      settledCollection,
      orderCount: ordersCount,
      averageOrderValue,
      outstanding,
      creditDue,
      cashCollection,
      upiCollection,
      cardCollection,
      gstCollected,
      cgst,
      sgst,
      discountsGiven,
      serviceCharge,
      nightCharge,
    };
  }

  // 2. Sales Trend
  async getSalesTrend(
    rangeType: string,
    groupBy: 'HOURLY' | 'DAILY' | 'MONTHLY',
    customStart?: string,
    customEnd?: string,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    const bills = await this.prisma.bill.findMany({
      where: {
        finalizedAt: { gte: startDateUtc, lte: endDateUtc },
        status: { in: this.eligibleBillStatuses },
      },
      select: {
        finalizedAt: true,
        grandTotal: true,
      },
    });

    const payments = await this.prisma.payment.findMany({
      where: {
        paidAt: { gte: startDateUtc, lte: endDateUtc },
        isSettled: true,
      },
      select: {
        paidAt: true,
        amount: true,
      },
    });

    const groups: Record<string, { billed: number; settled: number }> = {};
    const KOLKATA_OFFSET = 5.5 * 60 * 60 * 1000;

    const getGroupKey = (date: Date) => {
      const zoned = new Date(date.getTime() + KOLKATA_OFFSET);
      if (groupBy === 'HOURLY') {
        const hour = zoned.getUTCHours();
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 === 0 ? 12 : hour % 12;
        return `${displayHour} ${ampm}`;
      } else if (groupBy === 'MONTHLY') {
        return zoned.toLocaleString('en-US', {
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        });
      } else {
        return zoned.toISOString().split('T')[0];
      }
    };

    bills.forEach((b) => {
      if (!b.finalizedAt) return;
      const key = getGroupKey(b.finalizedAt);
      if (!groups[key]) groups[key] = { billed: 0, settled: 0 };
      groups[key].billed += Number(b.grandTotal);
    });

    payments.forEach((p) => {
      if (!p.paidAt) return;
      const key = getGroupKey(p.paidAt);
      if (!groups[key]) groups[key] = { billed: 0, settled: 0 };
      groups[key].settled += Number(p.amount);
    });

    const trend = Object.entries(groups).map(([label, val]) => ({
      label,
      billedSales: Number(val.billed.toFixed(2)),
      settledCollection: Number(val.settled.toFixed(2)),
    }));

    return trend;
  }

  // 3. Orders analytics
  async getOrderAnalytics(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDateUtc, lte: endDateUtc },
      },
    });

    const total = orders.length;
    const qrCount = orders.filter((o) => o.source === 'QR').length;
    const posCount = orders.filter((o) => o.source !== 'QR').length;

    const dineInCount = orders.filter((o) => o.tableId !== null).length;
    const takeawayCount = orders.filter((o) => o.tableId === null).length;

    const statuses = {
      RECEIVED: orders.filter((o) => o.status === 'RECEIVED').length,
      ACCEPTED: orders.filter((o) => o.status === 'ACCEPTED').length,
      PREPARING: orders.filter((o) => o.status === 'PREPARING').length,
      READY: orders.filter((o) => o.status === 'READY').length,
      SERVED: orders.filter((o) => o.status === 'SERVED').length,
      COMPLETED: orders.filter((o) => o.status === 'COMPLETED').length,
      CANCELLED: orders.filter((o) => o.status === 'CANCELLED').length,
      VOIDED: orders.filter((o) => o.status === 'VOIDED').length,
    };

    const eligibleForCancel = orders.filter(
      (o) => o.status !== 'VOIDED',
    ).length;
    const cancellationRate =
      eligibleForCancel > 0
        ? Number(((statuses.CANCELLED / eligibleForCancel) * 100).toFixed(2))
        : 0;
    const voidRate =
      total > 0 ? Number(((statuses.VOIDED / total) * 100).toFixed(2)) : 0;

    return {
      total,
      qrCount,
      posCount,
      dineInCount,
      takeawayCount,
      statuses,
      cancellationRate,
      voidRate,
    };
  }

  // 4. Payments analytics
  async getPaymentAnalytics(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    const payments = await this.prisma.payment.findMany({
      where: {
        paidAt: { gte: startDateUtc, lte: endDateUtc },
      },
    });

    const settledPayments = payments.filter((p) => p.isSettled);
    const totalSettled = settledPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );

    const cash = settledPayments
      .filter((p) => p.method === PaymentMethod.CASH)
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const upi = settledPayments
      .filter((p) => p.method === PaymentMethod.UPI)
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const card = settledPayments
      .filter((p) => p.method === PaymentMethod.CARD)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    // Credit-classified outstanding (Credit Due)
    const creditBills = await this.prisma.bill.findMany({
      where: {
        finalizedAt: { gte: startDateUtc, lte: endDateUtc },
        status: { in: this.eligibleBillStatuses },
        payments: {
          some: {
            method: PaymentMethod.CREDIT,
            isSettled: false,
          },
        },
      },
      include: {
        payments: true,
      },
    });

    let creditDue = 0;
    creditBills.forEach((b) => {
      const settledSum = b.payments
        .filter((p) => p.isSettled)
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const billOutstanding = Math.max(0, Number(b.grandTotal) - settledSum);
      creditDue += billOutstanding;
    });

    const bills = await this.prisma.bill.findMany({
      where: {
        finalizedAt: { gte: startDateUtc, lte: endDateUtc },
        status: { in: this.eligibleBillStatuses },
      },
    });

    const paidBillsCount = bills.filter(
      (b) => b.paymentStatus === 'PAID',
    ).length;
    const partialBillsCount = bills.filter(
      (b) => b.paymentStatus === 'PARTIALLY_PAID',
    ).length;
    const unpaidBillsCount = bills.filter(
      (b) => b.paymentStatus === 'UNPAID',
    ).length;

    const billedSales = bills.reduce((sum, b) => sum + Number(b.grandTotal), 0);
    const outstanding = Math.max(0, billedSales - totalSettled);

    return {
      totalSettled,
      cash,
      upi,
      card,
      creditDue,
      outstanding,
      paidBillsCount,
      partialBillsCount,
      unpaidBillsCount,
    };
  }

  // 5. Discount analytics
  async getDiscountAnalytics(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    const bills = await this.prisma.bill.findMany({
      where: {
        finalizedAt: { gte: startDateUtc, lte: endDateUtc },
        status: { in: this.eligibleBillStatuses },
      },
    });

    const total = bills.reduce((sum, b) => sum + Number(b.discount), 0);
    const itemDiscounts = bills.reduce(
      (sum, b) => sum + Number(b.itemDiscount),
      0,
    );
    const couponDiscounts = bills.reduce(
      (sum, b) => sum + Number(b.couponDiscount),
      0,
    );
    const manualDiscounts = bills.reduce(
      (sum, b) => sum + Number(b.manualDiscount),
      0,
    );

    const manualBills = bills.filter((b) => Number(b.manualDiscount) > 0);
    const manualDiscountCount = manualBills.length;
    const averageManualDiscount =
      manualDiscountCount > 0
        ? Number((manualDiscounts / manualDiscountCount).toFixed(2))
        : 0;

    const couponUsages = await this.prisma.couponUsage.findMany({
      where: {
        createdAt: { gte: startDateUtc, lte: endDateUtc },
      },
    });

    const couponUsageCount = couponUsages.length;
    const couponsGrouped: Record<
      string,
      { code: string; count: number; value: number }
    > = {};

    couponUsages.forEach((cu) => {
      const code = cu.couponCodeSnapshot;
      if (!couponsGrouped[code]) {
        couponsGrouped[code] = { code, count: 0, value: 0 };
      }
      couponsGrouped[code].count++;
    });

    const billsWithCoupon = bills.filter((b) => Number(b.couponDiscount) > 0);
    const couponDiscountAmount = billsWithCoupon.reduce(
      (sum, b) => sum + Number(b.couponDiscount),
      0,
    );

    const topCoupons = Object.values(couponsGrouped)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      total,
      itemDiscounts,
      couponDiscounts,
      manualDiscounts,
      manualDiscountCount,
      averageManualDiscount,
      couponUsageCount,
      couponDiscountAmount,
      topCoupons,
    };
  }

  // 6. Items analytics
  async getItemAnalytics(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        order: {
          createdAt: { gte: startDateUtc, lte: endDateUtc },
          status: {
            in: ['COMPLETED', 'SERVED', 'READY', 'PREPARING', 'ACCEPTED'],
          },
        },
      },
    });

    const itemsGroup: Record<
      string,
      { name: string; qty: number; rev: number; categoryId?: string }
    > = {};

    orderItems.forEach((oi) => {
      const name = oi.nameSnapshot;
      if (!itemsGroup[name]) {
        itemsGroup[name] = {
          name,
          qty: 0,
          rev: 0,
          categoryId: oi.menuItemId ? 'yes' : undefined,
        };
      }
      itemsGroup[name].qty += oi.quantity;
      itemsGroup[name].rev += Number(oi.totalPrice);
    });

    const sortedByQty = Object.values(itemsGroup).sort((a, b) => b.qty - a.qty);
    const sortedByRev = Object.values(itemsGroup).sort((a, b) => b.rev - a.rev);

    const topSellingQty = sortedByQty.slice(0, 10);
    const topSellingRev = sortedByRev.slice(0, 10);
    const leastSelling = sortedByQty.slice(-5).reverse();

    const categoryGroup: Record<
      string,
      { name: string; qty: number; rev: number }
    > = {};
    const itemsWithCategory = await this.prisma.orderItem.findMany({
      where: {
        order: {
          createdAt: { gte: startDateUtc, lte: endDateUtc },
          status: {
            in: ['COMPLETED', 'SERVED', 'READY', 'PREPARING', 'ACCEPTED'],
          },
        },
      },
      include: {
        menuItem: {
          include: { category: true },
        },
      },
    });

    itemsWithCategory.forEach((oi) => {
      const catName = oi.menuItem?.category?.name || 'Uncategorized';
      if (!categoryGroup[catName]) {
        categoryGroup[catName] = { name: catName, qty: 0, rev: 0 };
      }
      categoryGroup[catName].qty += oi.quantity;
      categoryGroup[catName].rev += Number(oi.totalPrice);
    });

    const categorySales = Object.values(categoryGroup).sort(
      (a, b) => b.rev - a.rev,
    );

    return {
      topSellingQty,
      topSellingRev,
      leastSelling,
      categorySales,
    };
  }

  // 7. Customer analytics
  async getCustomerAnalytics(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    const totalCustomers = await this.prisma.customer.count();
    const withPhone = await this.prisma.customer.count({
      where: { phone: { not: '' } },
    });

    const marketingConsentCount = await this.prisma.customer.count({
      where: { marketingConsent: true },
    });
    const marketingConsentRate =
      totalCustomers > 0
        ? Number(((marketingConsentCount / totalCustomers) * 100).toFixed(2))
        : 0;

    const ordersWithCustomer = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDateUtc, lte: endDateUtc },
        customerId: { not: null },
        status: { in: ['COMPLETED', 'SERVED'] },
      },
      select: { customerId: true },
    });
    const uniqueCustomerIds = Array.from(
      new Set(ordersWithCustomer.map((o) => o.customerId)),
    );

    let newCustomers = 0;
    let returningCustomers = 0;

    for (const cid of uniqueCustomerIds) {
      if (!cid) continue;
      const priorOrder = await this.prisma.order.findFirst({
        where: {
          customerId: cid,
          createdAt: { lt: startDateUtc },
          status: { in: ['COMPLETED', 'SERVED'] },
        },
      });
      if (priorOrder) {
        returningCustomers++;
      } else {
        newCustomers++;
      }
    }

    const customerOrders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDateUtc, lte: endDateUtc },
        customerId: { not: null },
        status: { in: ['COMPLETED', 'SERVED'] },
      },
      include: { customer: true },
    });

    const spends: Record<
      string,
      {
        name: string;
        phoneSafe: string;
        spend: number;
        count: number;
        lastVisit: Date;
      }
    > = {};
    customerOrders.forEach((co) => {
      if (!co.customer) return;
      const cid = co.customerId!;
      if (!spends[cid]) {
        const rawPhone = co.customer.phone || '';
        const phoneSafe =
          rawPhone.length > 5
            ? rawPhone.substring(0, 3) +
              '****' +
              rawPhone.substring(rawPhone.length - 3)
            : 'Walk-in';
        spends[cid] = {
          name: co.customer.name,
          phoneSafe,
          spend: 0,
          count: 0,
          lastVisit: co.createdAt,
        };
      }
      spends[cid].spend += Number(co.grandTotal);
      spends[cid].count++;
      if (co.createdAt > spends[cid].lastVisit) {
        spends[cid].lastVisit = co.createdAt;
      }
    });

    const topCustomers = Object.values(spends)
      .sort((a: any, b: any) => b.spend - a.spend)
      .slice(0, 10);

    return {
      totalCustomers,
      withPhone,
      newCustomers,
      returningCustomers,
      marketingConsentCount,
      marketingConsentRate,
      topCustomers,
    };
  }

  // 8. Order performance
  async getOrderPerformance(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    const histories = await this.prisma.orderStatusHistory.findMany({
      where: {
        changedAt: { gte: startDateUtc, lte: endDateUtc },
      },
      orderBy: { changedAt: 'asc' },
    });

    const ordersGroup: Record<
      string,
      Array<{ status: string; time: Date }>
    > = {};
    histories.forEach((h) => {
      if (!ordersGroup[h.orderId]) {
        ordersGroup[h.orderId] = [];
      }
      ordersGroup[h.orderId].push({ status: h.newStatus, time: h.changedAt });
    });

    let totalAcceptTime = 0,
      acceptCount = 0;
    let totalPrepTime = 0,
      prepCount = 0;
    let totalServeTime = 0,
      serveCount = 0;
    let totalCompleteTime = 0,
      completeCount = 0;
    const completedTimes: Array<{ orderId: string; duration: number }> = [];

    Object.entries(ordersGroup).forEach(([orderId, steps]) => {
      const received = steps.find((s) => s.status === 'RECEIVED');
      const accepted = steps.find((s) => s.status === 'ACCEPTED');
      const preparing = steps.find((s) => s.status === 'PREPARING');
      const ready = steps.find((s) => s.status === 'READY');
      const served = steps.find((s) => s.status === 'SERVED');
      const completed = steps.find((s) => s.status === 'COMPLETED');

      if (received && accepted) {
        totalAcceptTime += accepted.time.getTime() - received.time.getTime();
        acceptCount++;
      }
      if (preparing && ready) {
        totalPrepTime += ready.time.getTime() - preparing.time.getTime();
        prepCount++;
      }
      if (ready && served) {
        totalServeTime += served.time.getTime() - ready.time.getTime();
        serveCount++;
      }
      if (received && completed) {
        const duration = completed.time.getTime() - received.time.getTime();
        totalCompleteTime += duration;
        completeCount++;
        completedTimes.push({
          orderId,
          duration: Math.round(duration / 1000 / 60),
        }); // in minutes
      }
    });

    const avgAccept =
      acceptCount > 0 ? Math.round(totalAcceptTime / acceptCount / 1000) : 0;
    const avgPrep =
      prepCount > 0 ? Math.round(totalPrepTime / prepCount / 1000 / 60) : 0;
    const avgServe =
      serveCount > 0 ? Math.round(totalServeTime / serveCount / 1000) : 0;
    const avgTotal =
      completeCount > 0
        ? Math.round(totalCompleteTime / completeCount / 1000 / 60)
        : 0;

    // Sort to find fastest / slowest orders
    completedTimes.sort((a, b) => b.duration - a.duration);
    const slowestOrders = completedTimes.slice(0, 5);
    const fastestOrders = [...completedTimes].reverse().slice(0, 5);

    return {
      avgAcceptSeconds: avgAccept,
      avgPrepMinutes: avgPrep,
      avgServeSeconds: avgServe,
      avgTotalMinutes: avgTotal,
      samples: {
        acceptCount,
        prepCount,
        serveCount,
        completeCount,
      },
      slowestOrders,
      fastestOrders,
    };
  }

  // 9. Staff activity
  async getStaffActivity(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    const statusHistories = await this.prisma.orderStatusHistory.findMany({
      where: {
        changedAt: { gte: startDateUtc, lte: endDateUtc },
        changedById: { not: null },
      },
      include: { changedBy: true },
    });

    const staffGroup: Record<
      string,
      {
        name: string;
        role: string;
        accepted: number;
        completed: number;
        discounts: number;
        payments: number;
        cancellations: number;
        voids: number;
      }
    > = {};

    const getStaff = (id: string, name: string, role: string) => {
      if (!staffGroup[id]) {
        staffGroup[id] = {
          name,
          role,
          accepted: 0,
          completed: 0,
          discounts: 0,
          payments: 0,
          cancellations: 0,
          voids: 0,
        };
      }
      return staffGroup[id];
    };

    statusHistories.forEach((h) => {
      const anyH = h as any;
      if (!anyH.changedBy) return;
      const s = getStaff(
        anyH.changedById,
        anyH.changedBy.name,
        anyH.changedBy.role,
      );
      if (anyH.newStatus === 'ACCEPTED') s.accepted++;
      if (anyH.newStatus === 'COMPLETED') s.completed++;
      if (anyH.newStatus === 'CANCELLED') s.cancellations++;
    });

    const payments = await this.prisma.payment.findMany({
      where: {
        paidAt: { gte: startDateUtc, lte: endDateUtc },
      },
      include: { receivedBy: true },
    });

    payments.forEach((p) => {
      if (!p.receivedBy) return;
      const s = getStaff(p.receivedById, p.receivedBy.name, p.receivedBy.role);
      s.payments += Number(p.amount);
    });

    const bills = await this.prisma.bill.findMany({
      where: {
        finalizedAt: { gte: startDateUtc, lte: endDateUtc },
        status: { in: this.eligibleBillStatuses },
        manualDiscountAppliedBy: { not: null },
      },
    });

    bills.forEach((b) => {
      if (!b.manualDiscountAppliedBy) return;
      const s = getStaff(
        b.manualDiscountAppliedBy,
        b.manualDiscountAppliedBy,
        'CASHIER',
      );
      s.discounts += Number(b.manualDiscount);
    });

    return Object.values(staffGroup);
  }

  // 10. Waiter calls
  async getWaiterCallAnalytics(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    const calls = await this.prisma.waiterCall.findMany({
      where: {
        requestedAt: { gte: startDateUtc, lte: endDateUtc },
      },
    });

    const total = calls.length;
    const acknowledged = calls.filter(
      (c) => c.status === 'ACKNOWLEDGED',
    ).length;
    const resolved = calls.filter((c) => c.status === 'RESOLVED').length;
    const pending = calls.filter((c) => c.status === 'PENDING').length;

    let totalAckTime = 0,
      ackCount = 0;
    let totalResolveTime = 0,
      resolveCount = 0;

    calls.forEach((c) => {
      if (c.acknowledgedAt && c.requestedAt) {
        totalAckTime += c.acknowledgedAt.getTime() - c.requestedAt.getTime();
        ackCount++;
      }
      if (c.resolvedAt && c.requestedAt) {
        totalResolveTime += c.resolvedAt.getTime() - c.requestedAt.getTime();
        resolveCount++;
      }
    });

    const avgAckSeconds =
      ackCount > 0 ? Math.round(totalAckTime / ackCount / 1000) : 0;
    const avgResolveSeconds =
      resolveCount > 0 ? Math.round(totalResolveTime / resolveCount / 1000) : 0;

    return {
      total,
      acknowledged,
      resolved,
      pending,
      avgAckSeconds,
      avgResolveSeconds,
    };
  }

  // 11. Table Performance Analytics (Exclude Takeaway which has tableId = null)
  async getTableAnalytics(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDateUtc, lte: endDateUtc },
        tableId: { not: null }, // STRICT DINE-IN FILTER
        status: { in: ['COMPLETED', 'SERVED'] },
      },
    });

    const tablesGroup: Record<
      string,
      { label: string; count: number; spend: number }
    > = {};

    orders.forEach((o) => {
      const label = o.tableNumberSnapshot || 'Unknown';
      if (!tablesGroup[label]) {
        tablesGroup[label] = { label, count: 0, spend: 0 };
      }
      tablesGroup[label].count++;
      tablesGroup[label].spend += Number(o.grandTotal);
    });

    const formatted = Object.values(tablesGroup)
      .map((t) => ({
        tableLabel: t.label,
        orderCount: t.count,
        totalSales: Number(t.spend.toFixed(2)),
        averageBill: t.count > 0 ? Number((t.spend / t.count).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.totalSales - a.totalSales);

    return formatted;
  }

  // ----------------------------------------------------
  // REPORTS API QUERY IMPLEMENTATION (with skip/take pagination)
  // ----------------------------------------------------

  async getDailySalesReport(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
    page?: number,
    limit?: number,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    const bills = await this.prisma.bill.findMany({
      where: {
        finalizedAt: { gte: startDateUtc, lte: endDateUtc },
        status: { in: this.eligibleBillStatuses },
      },
    });

    const payments = await this.prisma.payment.findMany({
      where: {
        paidAt: { gte: startDateUtc, lte: endDateUtc },
      },
    });

    const dailyData: Record<string, any> = {};
    const KOLKATA_OFFSET = 5.5 * 60 * 60 * 1000;

    bills.forEach((b) => {
      if (!b.finalizedAt) return;
      const dateKey = new Date(b.finalizedAt.getTime() + KOLKATA_OFFSET)
        .toISOString()
        .split('T')[0];
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = {
          date: dateKey,
          orders: 0,
          billedSales: 0,
          settledCollection: 0,
          cash: 0,
          upi: 0,
          card: 0,
          credit: 0,
          outstanding: 0,
          discounts: 0,
          gst: 0,
          serviceCharge: 0,
          nightCharge: 0,
        };
      }
      const day = dailyData[dateKey];
      day.orders++;
      day.billedSales += Number(b.grandTotal);
      day.discounts += Number(b.discount);
      day.gst += Number(b.cgst) + Number(b.sgst);
      day.serviceCharge += Number(b.serviceCharge);
      day.nightCharge += Number(b.nightCharge);
    });

    payments.forEach((p) => {
      if (!p.paidAt) return;
      const dateKey = new Date(p.paidAt.getTime() + KOLKATA_OFFSET)
        .toISOString()
        .split('T')[0];
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = {
          date: dateKey,
          orders: 0,
          billedSales: 0,
          settledCollection: 0,
          cash: 0,
          upi: 0,
          card: 0,
          credit: 0,
          outstanding: 0,
          discounts: 0,
          gst: 0,
          serviceCharge: 0,
          nightCharge: 0,
        };
      }
      const day = dailyData[dateKey];
      if (p.isSettled) {
        day.settledCollection += Number(p.amount);
        if (p.method === PaymentMethod.CASH) day.cash += Number(p.amount);
        if (p.method === PaymentMethod.UPI) day.upi += Number(p.amount);
        if (p.method === PaymentMethod.CARD) day.card += Number(p.amount);
      } else {
        if (p.method === PaymentMethod.CREDIT) day.credit += Number(p.amount);
      }
    });

    Object.values(dailyData).forEach((day: any) => {
      day.outstanding = Math.max(0, day.billedSales - day.settledCollection);
      day.billedSales = Number(day.billedSales.toFixed(2));
      day.settledCollection = Number(day.settledCollection.toFixed(2));
      day.cash = Number(day.cash.toFixed(2));
      day.upi = Number(day.upi.toFixed(2));
      day.card = Number(day.card.toFixed(2));
      day.credit = Number(day.credit.toFixed(2));
      day.outstanding = Number(day.outstanding.toFixed(2));
      day.discounts = Number(day.discounts.toFixed(2));
      day.gst = Number(day.gst.toFixed(2));
      day.serviceCharge = Number(day.serviceCharge.toFixed(2));
      day.nightCharge = Number(day.nightCharge.toFixed(2));
    });

    const sorted = Object.values(dailyData).sort((a: any, b: any) =>
      b.date.localeCompare(a.date),
    );
    if (page && limit) {
      const items = sorted.slice((page - 1) * limit, page * limit);
      return { items, total: sorted.length, page, limit };
    }
    return sorted;
  }

  async getPaymentsReport(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
    page?: number,
    limit?: number,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    const total = await this.prisma.payment.count({
      where: { paidAt: { gte: startDateUtc, lte: endDateUtc } },
    });

    const items = await this.prisma.payment.findMany({
      where: {
        paidAt: { gte: startDateUtc, lte: endDateUtc },
      },
      include: {
        receivedBy: { select: { id: true, name: true } },
        bill: { select: { id: true, invoiceNumber: true } },
        order: { select: { id: true, orderNumber: true } },
      },
      orderBy: { paidAt: 'desc' },
      ...(page && limit ? { skip: (page - 1) * limit, take: limit } : {}),
    });

    if (page && limit) {
      return { items, total, page, limit };
    }
    return items;
  }

  async getGSTReport(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
    page?: number,
    limit?: number,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    const total = await this.prisma.bill.count({
      where: {
        finalizedAt: { gte: startDateUtc, lte: endDateUtc },
        status: { in: this.eligibleBillStatuses },
      },
    });

    const items = await this.prisma.bill.findMany({
      where: {
        finalizedAt: { gte: startDateUtc, lte: endDateUtc },
        status: { in: this.eligibleBillStatuses },
      },
      select: {
        invoiceNumber: true,
        finalizedAt: true,
        taxableAmount: true,
        cgstRateSnapshot: true,
        cgst: true,
        sgstRateSnapshot: true,
        sgst: true,
        grandTotal: true,
      },
      orderBy: { finalizedAt: 'desc' },
      ...(page && limit ? { skip: (page - 1) * limit, take: limit } : {}),
    });

    if (page && limit) {
      return { items, total, page, limit };
    }
    return items;
  }

  async getCreditDueReport(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
    filter:
      'ALL' | 'DUE_TODAY' | 'DUE_1_7' | 'DUE_8_30' | 'DUE_30_PLUS' = 'ALL',
    page?: number,
    limit?: number,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    const bills = await this.prisma.bill.findMany({
      where: {
        finalizedAt: { gte: startDateUtc, lte: endDateUtc },
        status: { in: this.eligibleBillStatuses },
        paymentStatus: { in: ['PARTIALLY_PAID', 'UNPAID'] },
      },
      include: {
        order: {
          include: { customer: true },
        },
        payments: true,
      },
    });

    let reportRows = bills.map((b) => {
      const settled = b.payments
        .filter((p) => p.isSettled)
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const creditDue = b.payments
        .filter((p) => p.method === PaymentMethod.CREDIT)
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const outstanding = Math.max(0, Number(b.grandTotal) - settled);

      const finalizedDate = b.finalizedAt || new Date();
      const ageDays = Math.floor(
        (Date.now() - finalizedDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      const rawPhone = b.order?.customer?.phone || '';
      const phoneSafe =
        rawPhone.length > 5
          ? rawPhone.substring(0, 3) +
            '****' +
            rawPhone.substring(rawPhone.length - 3)
          : 'Walk-in';

      return {
        customerName: b.order?.customer?.name || 'Walk-in',
        customerPhoneSafe: phoneSafe,
        orderNumber: b.order?.orderNumber || '',
        invoiceNumber: b.invoiceNumber || 'DRAFT',
        finalizedAt: b.finalizedAt,
        grandTotal: Number(b.grandTotal),
        settled,
        creditDue,
        outstanding,
        ageDays,
      };
    });

    // Filtering by age
    if (filter === 'DUE_TODAY') {
      reportRows = reportRows.filter((r) => r.ageDays === 0);
    } else if (filter === 'DUE_1_7') {
      reportRows = reportRows.filter((r) => r.ageDays >= 1 && r.ageDays <= 7);
    } else if (filter === 'DUE_8_30') {
      reportRows = reportRows.filter((r) => r.ageDays >= 8 && r.ageDays <= 30);
    } else if (filter === 'DUE_30_PLUS') {
      reportRows = reportRows.filter((r) => r.ageDays > 30);
    }

    if (page && limit) {
      const items = reportRows.slice((page - 1) * limit, page * limit);
      return { items, total: reportRows.length, page, limit };
    }
    return reportRows;
  }

  async getCancellationsReport(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
    page?: number,
    limit?: number,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDateUtc, lte: endDateUtc },
        status: OrderStatus.CANCELLED,
      },
      include: {
        customer: true,
        statusHistory: {
          where: { newStatus: OrderStatus.CANCELLED },
          select: { notes: true },
          orderBy: { changedAt: 'desc' },
          take: 1,
        },
      },
    });

    const cancellations = (orders as any[]).map((o) => {
      const reason = o.statusHistory[0]?.notes || 'No reason specified';
      return {
        orderNumber: o.orderNumber,
        createdAt: o.createdAt,
        customerName: o.customer?.name || 'Walk-in',
        grandTotal: Number(o.grandTotal),
        reason,
      };
    });

    const reasonCounts: Record<string, number> = {};
    cancellations.forEach((c) => {
      const r = c.reason.toUpperCase();
      reasonCounts[r] = (reasonCounts[r] || 0) + 1;
    });

    if (page && limit) {
      const items = cancellations.slice((page - 1) * limit, page * limit);
      return { items, reasonCounts, total: cancellations.length, page, limit };
    }
    return { cancellations, reasonCounts };
  }

  // 12. Order Report
  async getOrdersReport(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
    page?: number,
    limit?: number,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    const total = await this.prisma.order.count({
      where: { createdAt: { gte: startDateUtc, lte: endDateUtc } },
    });

    const items = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDateUtc, lte: endDateUtc },
      },
      include: {
        customer: { select: { name: true, phone: true } },
        table: { select: { tableNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      ...(page && limit ? { skip: (page - 1) * limit, take: limit } : {}),
    });

    if (page && limit) {
      return { items, total, page, limit };
    }
    return items;
  }

  // 13. Item Sales Report
  async getItemSalesReport(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
    page?: number,
    limit?: number,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        order: {
          createdAt: { gte: startDateUtc, lte: endDateUtc },
          status: {
            in: ['COMPLETED', 'SERVED', 'READY', 'PREPARING', 'ACCEPTED'],
          },
        },
      },
      include: {
        menuItem: {
          include: { category: true },
        },
      },
    });

    const itemsGroup: Record<string, any> = {};
    orderItems.forEach((oi) => {
      const key = oi.nameSnapshot + '_' + (oi.variantNameSnapshot || '');
      if (!itemsGroup[key]) {
        itemsGroup[key] = {
          name: oi.nameSnapshot,
          variant: oi.variantNameSnapshot || '',
          category: oi.menuItem?.category?.name || 'Uncategorized',
          qty: 0,
          unitPrice:
            Number(oi.priceSnapshot) + Number(oi.variantPriceSnapshot || 0),
          discount: 0,
          netRevenue: 0,
        };
      }
      const group = itemsGroup[key];
      group.qty += oi.quantity;
      group.discount += Number(oi.discountSnapshot) * oi.quantity;
      group.netRevenue += Number(oi.totalPrice);
    });

    const sorted = Object.values(itemsGroup).sort(
      (a: any, b: any) => b.netRevenue - a.netRevenue,
    );
    if (page && limit) {
      const items = sorted.slice((page - 1) * limit, page * limit);
      return { items, total: sorted.length, page, limit };
    }
    return sorted;
  }

  // 14. Customer Report
  async getCustomersReport(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
    page?: number,
    limit?: number,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    const customerOrders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDateUtc, lte: endDateUtc },
        customerId: { not: null },
        status: { in: ['COMPLETED', 'SERVED'] },
      },
      include: { customer: true },
    });

    const customerGroup: Record<string, any> = {};
    customerOrders.forEach((co) => {
      if (!co.customer) return;
      const cid = co.customerId!;
      if (!customerGroup[cid]) {
        customerGroup[cid] = {
          customerId: cid,
          name: co.customer.name,
          phone: co.customer.phone || 'Walk-in',
          orderCount: 0,
          totalSpend: 0,
          lastVisit: co.createdAt,
        };
      }
      const g = customerGroup[cid];
      g.orderCount++;
      g.totalSpend += Number(co.grandTotal);
      if (co.createdAt > g.lastVisit) {
        g.lastVisit = co.createdAt;
      }
    });

    const sorted = Object.values(customerGroup).sort(
      (a: any, b: any) => b.totalSpend - a.totalSpend,
    );
    if (page && limit) {
      const items = sorted.slice((page - 1) * limit, page * limit);
      return { items, total: sorted.length, page, limit };
    }
    return sorted;
  }

  // 15. Discount Report
  async getDiscountsReport(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
    page?: number,
    limit?: number,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    const total = await this.prisma.bill.count({
      where: {
        finalizedAt: { gte: startDateUtc, lte: endDateUtc },
        status: { in: this.eligibleBillStatuses },
        discount: { gt: 0 },
      },
    });

    const items = await this.prisma.bill.findMany({
      where: {
        finalizedAt: { gte: startDateUtc, lte: endDateUtc },
        status: { in: this.eligibleBillStatuses },
        discount: { gt: 0 },
      },
      include: {
        order: {
          include: { customer: true },
        },
      },
      orderBy: { finalizedAt: 'desc' },
      ...(page && limit ? { skip: (page - 1) * limit, take: limit } : {}),
    });

    if (page && limit) {
      return { items, total, page, limit };
    }
    return items;
  }

  async getCouponAnalytics(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    // 1. Total Coupon Discount & Redemptions
    const usageAgg = await this.prisma.couponUsage.aggregate({
      _sum: {
        appliedDiscountSnapshot: true,
      },
      _count: {
        id: true,
      },
      where: {
        createdAt: { gte: startDateUtc, lte: endDateUtc },
      },
    });

    const totalDiscount = Number(usageAgg._sum?.appliedDiscountSnapshot ?? 0);
    const redemptions = usageAgg._count?.id ?? 0;

    // 2. Active vs Reversed Counts
    const activeCount = await this.prisma.couponUsage.count({
      where: {
        createdAt: { gte: startDateUtc, lte: endDateUtc },
        status: 'ACTIVE',
      },
    });

    const reversedCount = await this.prisma.couponUsage.count({
      where: {
        createdAt: { gte: startDateUtc, lte: endDateUtc },
        status: 'REVERSED',
      },
    });

    // 3. Unique Coupon Customers
    const uniqueCustomersGroup = await this.prisma.couponUsage.groupBy({
      by: ['customerId'],
      where: {
        createdAt: { gte: startDateUtc, lte: endDateUtc },
        customerId: { not: null },
      },
    });
    const uniqueCustomers = uniqueCustomersGroup.length;

    // 4. Average Coupon Discount
    const averageDiscount =
      redemptions > 0 ? this.roundToTwo(totalDiscount / redemptions) : 0;

    // 5. Top Coupons By Usage (group by code/name)
    const topByUsageRaw = await this.prisma.couponUsage.groupBy({
      by: ['couponCodeSnapshot', 'couponNameSnapshot'],
      _count: {
        id: true,
      },
      _sum: {
        appliedDiscountSnapshot: true,
      },
      where: {
        createdAt: { gte: startDateUtc, lte: endDateUtc },
        status: 'ACTIVE',
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: 10,
    });

    const topCoupons = topByUsageRaw.map((g) => ({
      code: g.couponCodeSnapshot,
      name: g.couponNameSnapshot,
      usageCount: g._count?.id ?? 0,
      totalDiscountValue: Number(g._sum?.appliedDiscountSnapshot ?? 0),
    }));

    // 6. Coupon Limit Utilization (for current active coupons in system)
    const activeCoupons = await this.prisma.coupon.findMany({
      where: { isActive: true },
      select: {
        code: true,
        usedCount: true,
        usageLimit: true,
      },
    });

    const limitUtilization = activeCoupons.map((c) => ({
      code: c.code,
      usedCount: c.usedCount,
      usageLimit: c.usageLimit,
      utilizationPercent:
        c.usageLimit && c.usageLimit > 0
          ? this.roundToTwo((c.usedCount / c.usageLimit) * 100)
          : 100,
    }));

    // Fetch coupon usages for trend grouping
    const usagesList = await this.prisma.couponUsage.findMany({
      where: {
        createdAt: { gte: startDateUtc, lte: endDateUtc },
      },
      select: {
        createdAt: true,
        status: true,
        appliedDiscountSnapshot: true,
      },
    });

    const groups: Record<
      string,
      {
        period: string;
        redemptions: number;
        activeUsages: number;
        reversedUsages: number;
        totalDiscount: number;
      }
    > = {};

    const KOLKATA_OFFSET = 5.5 * 60 * 60 * 1000;
    usagesList.forEach((u) => {
      const zoned = new Date(u.createdAt.getTime() + KOLKATA_OFFSET);
      let period = '';
      if (rangeType === 'TODAY' || rangeType === 'YESTERDAY') {
        const hour = zoned.getUTCHours();
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 === 0 ? 12 : hour % 12;
        period = `${displayHour} ${ampm}`;
      } else {
        period = zoned.toISOString().split('T')[0];
      }

      if (!groups[period]) {
        groups[period] = {
          period,
          redemptions: 0,
          activeUsages: 0,
          reversedUsages: 0,
          totalDiscount: 0,
        };
      }

      const g = groups[period];
      g.redemptions += 1;
      if (u.status === 'ACTIVE') {
        g.activeUsages += 1;
        g.totalDiscount += Number(u.appliedDiscountSnapshot);
      } else if (u.status === 'REVERSED') {
        g.reversedUsages += 1;
      }
    });

    const usageTrend = Object.values(groups).map((g) => ({
      ...g,
      totalDiscount: Math.round(g.totalDiscount * 100) / 100,
    }));

    return {
      totalDiscount,
      redemptions,
      activeCount,
      reversedCount,
      uniqueCustomers,
      averageDiscount,
      topCoupons,
      limitUtilization,
      usageTrend,
    };
  }

  async getCouponUsageReport(
    rangeType: string,
    customStart?: string,
    customEnd?: string,
    page?: number,
    limit?: number,
  ) {
    const { startDateUtc, endDateUtc } = this.getKolkataRange(
      rangeType,
      customStart,
      customEnd,
    );

    const where: Prisma.CouponUsageWhereInput = {
      createdAt: { gte: startDateUtc, lte: endDateUtc },
    };

    if (page !== undefined || limit !== undefined) {
      const pageVal = page ?? 1;
      const limitVal = limit ?? 20;
      const p = pageVal <= 0 ? 1 : Math.max(1, pageVal);
      const l = limitVal <= 0 ? 20 : Math.min(100, Math.max(1, limitVal));
      const skip = (p - 1) * l;
      const [items, total] = await Promise.all([
        this.prisma.couponUsage.findMany({
          where,
          include: {
            customer: {
              select: { id: true, name: true },
            },
            order: {
              select: { id: true, orderNumber: true },
            },
            bill: {
              select: { id: true, invoiceNumber: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: l,
        }),
        this.prisma.couponUsage.count({ where }),
      ]);
      return { items, total, page: p, limit: l };
    }

    return this.prisma.couponUsage.findMany({
      where,
      include: {
        customer: {
          select: { id: true, name: true },
        },
        order: {
          select: { id: true, orderNumber: true },
        },
        bill: {
          select: { id: true, invoiceNumber: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
