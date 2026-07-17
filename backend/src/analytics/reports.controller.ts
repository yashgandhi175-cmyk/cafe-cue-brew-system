/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import {
  Controller,
  Get,
  Query,
  UseGuards,
  Param,
  Res,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  private async checkFinancialAccess(user: any) {
    if (user.role === Role.OWNER) return;
    const settings = await this.analyticsService.getSettingsForGuard();
    if (settings?.managerCanViewFinancialReports) return;
    throw new ForbiddenException(
      'Access denied: Manager is not authorized to view financial reports.',
    );
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('daily-sales')
  async getDailySales(
    @CurrentUser() user: any,
    @Query('range') range: string = 'TODAY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    await this.checkFinancialAccess(user);
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    return this.analyticsService.getDailySalesReport(
      range,
      startDate,
      endDate,
      p,
      l,
    );
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('payments')
  async getPayments(
    @CurrentUser() user: any,
    @Query('range') range: string = 'TODAY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    await this.checkFinancialAccess(user);
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    return this.analyticsService.getPaymentsReport(
      range,
      startDate,
      endDate,
      p,
      l,
    );
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('gst')
  async getGST(
    @CurrentUser() user: any,
    @Query('range') range: string = 'TODAY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    await this.checkFinancialAccess(user);
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    return this.analyticsService.getGSTReport(range, startDate, endDate, p, l);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('credit-due')
  async getCreditDue(
    @CurrentUser() user: any,
    @Query('range') range: string = 'TODAY',
    @Query('filter')
    filter:
      'ALL' | 'DUE_TODAY' | 'DUE_1_7' | 'DUE_8_30' | 'DUE_30_PLUS' = 'ALL',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    await this.checkFinancialAccess(user);
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    return this.analyticsService.getCreditDueReport(
      range,
      startDate,
      endDate,
      filter,
      p,
      l,
    );
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('cancellations')
  async getCancellations(
    @Query('range') range: string = 'TODAY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    return this.analyticsService.getCancellationsReport(
      range,
      startDate,
      endDate,
      p,
      l,
    );
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('orders')
  async getOrders(
    @Query('range') range: string = 'TODAY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    return this.analyticsService.getOrdersReport(
      range,
      startDate,
      endDate,
      p,
      l,
    );
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('items')
  async getItems(
    @Query('range') range: string = 'TODAY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    return this.analyticsService.getItemSalesReport(
      range,
      startDate,
      endDate,
      p,
      l,
    );
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('customers')
  async getCustomers(
    @Query('range') range: string = 'TODAY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    return this.analyticsService.getCustomersReport(
      range,
      startDate,
      endDate,
      p,
      l,
    );
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('discounts')
  async getDiscounts(
    @CurrentUser() user: any,
    @Query('range') range: string = 'TODAY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    await this.checkFinancialAccess(user);
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    return this.analyticsService.getDiscountsReport(
      range,
      startDate,
      endDate,
      p,
      l,
    );
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('coupons')
  async getCouponsReport(
    @CurrentUser() user: any,
    @Query('range') range: string = 'TODAY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    await this.checkFinancialAccess(user);
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    return this.analyticsService.getCouponUsageReport(
      range,
      startDate,
      endDate,
      p,
      l,
    );
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get(':reportType/export.csv')
  async exportCsv(
    @Param('reportType') reportType: string,
    @Res() res: any,
    @CurrentUser() user: any,
    @Query('range') range: string = 'TODAY',
    @Query('filter')
    filter:
      'ALL' | 'DUE_TODAY' | 'DUE_1_7' | 'DUE_8_30' | 'DUE_30_PLUS' = 'ALL',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (user.role === Role.MANAGER) {
      if (reportType === 'coupons') {
        const settings = await this.analyticsService.getSettingsForGuard();
        if (
          !settings?.managerCanViewFinancialReports ||
          !settings?.managerCanManageCoupons
        ) {
          throw new ForbiddenException(
            'Access denied: Manager lacks coupon report permissions.',
          );
        }
      } else {
        await this.checkFinancialAccess(user);
      }
    }

    let headers: string[] = [];
    let rows: any[][] = [];
    const EXPORT_LIMIT = 5000;

    const escapeCsv = (val: any): string => {
      if (val === null || val === undefined) return '';
      let str = String(val).replace(/"/g, '""');
      if (
        str.startsWith('=') ||
        str.startsWith('+') ||
        str.startsWith('-') ||
        str.startsWith('@')
      ) {
        str = `'${str}`; // Formula injection protection
      }
      return `"${str}"`;
    };

    if (reportType === 'daily-sales') {
      const data = (await this.analyticsService.getDailySalesReport(
        range,
        startDate,
        endDate,
      )) as any[];
      if (data.length > EXPORT_LIMIT) {
        throw new BadRequestException(
          `Export limit exceeded. Query yields ${data.length} rows (limit ${EXPORT_LIMIT}).`,
        );
      }
      headers = [
        'Date',
        'Orders',
        'Billed Sales',
        'Settled Collection',
        'Cash',
        'UPI',
        'Card',
        'Credit Due',
        'Outstanding',
        'Discounts',
        'GST',
        'Service Charge',
        'Night Charge',
      ];
      rows = data.map((d) => [
        d.date,
        d.orders,
        d.billedSales,
        d.settledCollection,
        d.cash,
        d.upi,
        d.card,
        d.credit,
        d.outstanding,
        d.discounts,
        d.gst,
        d.serviceCharge,
        d.nightCharge,
      ]);
    } else if (reportType === 'gst') {
      const data = (await this.analyticsService.getGSTReport(
        range,
        startDate,
        endDate,
      )) as any[];
      if (data.length > EXPORT_LIMIT) {
        throw new BadRequestException(
          `Export limit exceeded. Query yields ${data.length} rows (limit ${EXPORT_LIMIT}).`,
        );
      }
      headers = [
        'Invoice Number',
        'Date',
        'Taxable Amount',
        'CGST Rate (%)',
        'CGST Amount',
        'SGST Rate (%)',
        'SGST Amount',
        'Total Grand',
      ];
      rows = data.map((d) => [
        d.invoiceNumber || 'DRAFT',
        d.finalizedAt
          ? new Date(d.finalizedAt).toISOString().split('T')[0]
          : '',
        d.taxableAmount,
        d.cgstRateSnapshot,
        d.cgst,
        d.sgstRateSnapshot,
        d.sgst,
        d.grandTotal,
      ]);
    } else if (reportType === 'credit-due') {
      const data = (await this.analyticsService.getCreditDueReport(
        range,
        startDate,
        endDate,
        filter,
      )) as any[];
      if (data.length > EXPORT_LIMIT) {
        throw new BadRequestException(
          `Export limit exceeded. Query yields ${data.length} rows (limit ${EXPORT_LIMIT}).`,
        );
      }
      headers = [
        'Customer Name',
        'Phone',
        'Order No',
        'Invoice No',
        'Finalized Date',
        'Grand Total',
        'Settled',
        'Credit',
        'Outstanding',
        'Age (Days)',
      ];
      rows = data.map((d) => [
        d.customerName,
        d.customerPhoneSafe,
        d.orderNumber,
        d.invoiceNumber,
        d.finalizedAt
          ? new Date(d.finalizedAt).toISOString().split('T')[0]
          : '',
        d.grandTotal,
        d.settled,
        d.creditDue,
        d.outstanding,
        d.ageDays,
      ]);
    } else if (reportType === 'cancellations') {
      const result = await this.analyticsService.getCancellationsReport(
        range,
        startDate,
        endDate,
      );
      const data = (result as any).cancellations || [];
      if (data.length > EXPORT_LIMIT) {
        throw new BadRequestException(
          `Export limit exceeded. Query yields ${data.length} rows (limit ${EXPORT_LIMIT}).`,
        );
      }
      headers = [
        'Order Number',
        'Date',
        'Customer Name',
        'Grand Total',
        'Reason',
      ];
      rows = data.map((c: any) => [
        c.orderNumber,
        c.createdAt ? new Date(c.createdAt).toISOString() : '',
        c.customerName,
        c.grandTotal,
        c.reason,
      ]);
    } else if (reportType === 'payments') {
      const data = (await this.analyticsService.getPaymentsReport(
        range,
        startDate,
        endDate,
      )) as any[];
      if (data.length > EXPORT_LIMIT) {
        throw new BadRequestException(
          `Export limit exceeded. Query yields ${data.length} rows (limit ${EXPORT_LIMIT}).`,
        );
      }
      headers = [
        'Date',
        'Time',
        'Invoice No',
        'Order No',
        'Method',
        'Settled Amount',
        'Amount Tendered',
        'Change Due',
        'Recorded By',
      ];
      rows = data.map((d) => {
        const dateObj = new Date(d.paidAt);
        return [
          dateObj.toISOString().split('T')[0],
          dateObj.toTimeString().split(' ')[0],
          d.bill?.invoiceNumber || 'DRAFT',
          d.order?.orderNumber || '',
          d.method,
          d.amount,
          d.amountTendered || '',
          d.changeDue || '',
          d.receivedBy?.name || '',
        ];
      });
    } else if (reportType === 'orders') {
      const data = (await this.analyticsService.getOrdersReport(
        range,
        startDate,
        endDate,
      )) as any[];
      if (data.length > EXPORT_LIMIT) {
        throw new BadRequestException(
          `Export limit exceeded. Query yields ${data.length} rows (limit ${EXPORT_LIMIT}).`,
        );
      }
      headers = [
        'Order Number',
        'Timestamp',
        'Source',
        'Table',
        'Customer Name',
        'Customer Phone',
        'Subtotal',
        'Discount',
        'Tax',
        'Service Charge',
        'Grand Total',
        'Status',
        'Payment Status',
      ];
      rows = data.map((d) => [
        d.orderNumber,
        new Date(d.createdAt).toLocaleString('en-IN'),
        d.source,
        d.table?.tableNumber || 'Takeaway',
        d.customer?.name || 'Walk-in',
        d.customer?.phone || '',
        d.subtotal,
        d.discount,
        Number(d.cgst) + Number(d.sgst),
        d.serviceCharge,
        d.grandTotal,
        d.status,
        d.paymentStatus,
      ]);
    } else if (reportType === 'items') {
      const data = (await this.analyticsService.getItemSalesReport(
        range,
        startDate,
        endDate,
      )) as any[];
      if (data.length > EXPORT_LIMIT) {
        throw new BadRequestException(
          `Export limit exceeded. Query yields ${data.length} rows (limit ${EXPORT_LIMIT}).`,
        );
      }
      headers = [
        'Item Name',
        'Variant',
        'Category',
        'Quantity Sold',
        'Unit Price',
        'Discount Snapshot',
        'Net Revenue',
      ];
      rows = data.map((d) => [
        d.name,
        d.variant,
        d.category,
        d.qty,
        d.unitPrice,
        d.discount,
        d.netRevenue,
      ]);
    } else if (reportType === 'customers') {
      const data = (await this.analyticsService.getCustomersReport(
        range,
        startDate,
        endDate,
      )) as any[];
      if (data.length > EXPORT_LIMIT) {
        throw new BadRequestException(
          `Export limit exceeded. Query yields ${data.length} rows (limit ${EXPORT_LIMIT}).`,
        );
      }
      headers = [
        'Customer Name',
        'Phone',
        'Order Count',
        'Total Spend',
        'Last Visit',
      ];
      rows = data.map((d) => [
        d.name,
        d.phone,
        d.orderCount,
        d.totalSpend,
        new Date(d.lastVisit).toLocaleDateString('en-IN'),
      ]);
    } else if (reportType === 'discounts') {
      const data = (await this.analyticsService.getDiscountsReport(
        range,
        startDate,
        endDate,
      )) as any[];
      if (data.length > EXPORT_LIMIT) {
        throw new BadRequestException(
          `Export limit exceeded. Query yields ${data.length} rows (limit ${EXPORT_LIMIT}).`,
        );
      }
      headers = [
        'Invoice Number',
        'Finalized At',
        'Customer Name',
        'Subtotal',
        'Coupon Code',
        'Coupon Discount',
        'Manual Discount',
        'Discount Reason',
        'Applied By',
      ];
      rows = data.map((d) => [
        d.invoiceNumber || 'DRAFT',
        d.finalizedAt ? new Date(d.finalizedAt).toLocaleString('en-IN') : '',
        d.order?.customer?.name || 'Walk-in',
        d.subtotal,
        d.couponCodeSnapshot || '',
        d.couponDiscount,
        d.manualDiscount,
        d.manualDiscountReason || '',
        d.manualDiscountAppliedBy || '',
      ]);
    } else if (reportType === 'coupons') {
      const data = (await this.analyticsService.getCouponUsageReport(
        range,
        startDate,
        endDate,
      )) as any[];
      if (data.length > EXPORT_LIMIT) {
        throw new BadRequestException(
          `Export limit exceeded. Query yields ${data.length} rows (limit ${EXPORT_LIMIT}).`,
        );
      }
      headers = [
        'Date/Time',
        'Coupon Code Snapshot',
        'Coupon Name Snapshot',
        'Customer Name',
        'Order Number',
        'Invoice Number',
        'Discount Type Snapshot',
        'Discount Value Snapshot',
        'Maximum Discount Snapshot',
        'Applied Discount Snapshot',
        'Usage Status',
        'Reversed At',
      ];
      rows = data.map((d) => [
        new Date(d.createdAt).toLocaleString('en-IN'),
        d.couponCodeSnapshot,
        d.couponNameSnapshot,
        d.customer ? d.customer.name : 'Walk-in/Anonymous',
        d.order?.orderNumber || '',
        d.bill?.invoiceNumber || 'DRAFT',
        d.discountTypeSnapshot,
        d.discountValueSnapshot,
        d.maximumDiscountSnapshot || '',
        d.appliedDiscountSnapshot,
        d.status,
        d.reversedAt ? new Date(d.reversedAt).toLocaleString('en-IN') : '',
      ]);
    } else {
      throw new BadRequestException('Invalid report type for export.');
    }

    const csvContent = [
      headers.map(escapeCsv).join(','),
      ...rows.map((row) => row.map(escapeCsv).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=report-${reportType}-${range}.csv`,
    );
    return res.status(200).send(csvContent);
  }
}
