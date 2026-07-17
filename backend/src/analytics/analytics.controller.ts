/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import {
  Controller,
  Get,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  private async checkFinancialAccess(user: any) {
    if (user.role === Role.OWNER) return;
    const settings = await this.analyticsService.getSettingsForGuard();
    if (settings?.managerCanViewFinancialAnalytics) return;
    throw new ForbiddenException(
      'Access denied: Manager is not authorized to view financial analytics.',
    );
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('overview')
  async getOverview(
    @CurrentUser() user: any,
    @Query('range') range: string = 'TODAY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    await this.checkFinancialAccess(user);
    return this.analyticsService.getOverview(range, startDate, endDate);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('sales-trend')
  async getSalesTrend(
    @CurrentUser() user: any,
    @Query('range') range: string = 'TODAY',
    @Query('groupBy') groupBy: 'HOURLY' | 'DAILY' | 'MONTHLY' = 'DAILY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    await this.checkFinancialAccess(user);
    return this.analyticsService.getSalesTrend(
      range,
      groupBy,
      startDate,
      endDate,
    );
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('orders')
  async getOrders(
    @Query('range') range: string = 'TODAY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getOrderAnalytics(range, startDate, endDate);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('payments')
  async getPayments(
    @CurrentUser() user: any,
    @Query('range') range: string = 'TODAY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    await this.checkFinancialAccess(user);
    return this.analyticsService.getPaymentAnalytics(range, startDate, endDate);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('discounts')
  async getDiscounts(
    @CurrentUser() user: any,
    @Query('range') range: string = 'TODAY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    await this.checkFinancialAccess(user);
    return this.analyticsService.getDiscountAnalytics(
      range,
      startDate,
      endDate,
    );
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('items')
  async getItems(
    @Query('range') range: string = 'TODAY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getItemAnalytics(range, startDate, endDate);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('customers')
  async getCustomers(
    @CurrentUser() user: any,
    @Query('range') range: string = 'TODAY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getCustomerAnalytics(
      range,
      startDate,
      endDate,
    );
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('order-performance')
  async getOrderPerformance(
    @Query('range') range: string = 'TODAY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getOrderPerformance(range, startDate, endDate);
  }

  @Roles(Role.OWNER)
  @Get('staff-activity')
  async getStaffActivity(
    @Query('range') range: string = 'TODAY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getStaffActivity(range, startDate, endDate);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('waiter-calls')
  async getWaiterCalls(
    @Query('range') range: string = 'TODAY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getWaiterCallAnalytics(
      range,
      startDate,
      endDate,
    );
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('tables')
  async getTables(
    @CurrentUser() user: any,
    @Query('range') range: string = 'TODAY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    await this.checkFinancialAccess(user);
    return this.analyticsService.getTableAnalytics(range, startDate, endDate);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('coupons')
  async getCoupons(
    @CurrentUser() user: any,
    @Query('range') range: string = 'TODAY',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    await this.checkCouponAnalyticsAccess(user);
    return this.analyticsService.getCouponAnalytics(range, startDate, endDate);
  }

  private async checkCouponAnalyticsAccess(user: any) {
    if (user.role === Role.OWNER) return;
    const settings = await this.analyticsService.getSettingsForGuard();
    if (
      settings?.managerCanViewFinancialAnalytics &&
      settings?.managerCanManageCoupons
    )
      return;
    throw new ForbiddenException(
      'Access denied: Manager is not authorized to view coupon analytics.',
    );
  }
}
