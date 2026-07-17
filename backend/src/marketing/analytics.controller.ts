import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CampaignAnalyticsService } from './campaign-analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../common/prisma.service';
import { CampaignType, CampaignStatus } from '@prisma/client';

@Controller('marketing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'MANAGER')
export class AnalyticsController {
  constructor(
    private analyticsService: CampaignAnalyticsService,
    private prisma: PrismaService,
  ) {}

  @Get('analytics/overview')
  async getOverview(
    @CurrentUser() staff: { id: string },
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: CampaignType,
    @Query('status') status?: CampaignStatus,
  ) {
    // Audit Log: Dashboard opened
    await this.prisma.auditLog.create({
      data: {
        staffId: staff.id,
        action: 'DASHBOARD_OPENED',
        entityType: 'MARKETING',
        newData: JSON.stringify({
          filters: { startDate, endDate, type, status },
        }),
      },
    });

    return this.analyticsService.getOverviewAnalytics({
      startDate,
      endDate,
      type,
      status,
    });
  }

  @Get('campaigns/:id/analytics')
  async getCampaignAnalytics(
    @CurrentUser() staff: { id: string },
    @Param('id') id: string,
  ) {
    // Audit Log: Analytics viewed
    await this.prisma.auditLog.create({
      data: {
        staffId: staff.id,
        action: 'ANALYTICS_VIEWED',
        entityType: 'CAMPAIGN',
        entityId: id,
      },
    });

    return this.analyticsService.getCampaignAnalytics(id);
  }

  @Get('reports')
  async getReports(
    @CurrentUser() staff: { id: string },
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: CampaignType,
    @Query('status') status?: CampaignStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    // Audit Log: Report exported
    await this.prisma.auditLog.create({
      data: {
        staffId: staff.id,
        action: 'REPORT_EXPORTED',
        entityType: 'MARKETING',
        newData: JSON.stringify({
          filters: { startDate, endDate, type, status },
        }),
      },
    });

    const parsedPage = page ? parseInt(page) : 1;
    const parsedLimit = limit ? parseInt(limit) : 10;

    return this.analyticsService.getReports({
      startDate,
      endDate,
      type,
      status,
      page: parsedPage,
      limit: parsedLimit,
    });
  }
}
