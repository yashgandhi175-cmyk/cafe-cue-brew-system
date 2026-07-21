import { Controller, Get, Post, Body, Query, Param, UseGuards } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Role, PaymentMethod } from '@prisma/client';

@Controller('credits')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Get('summary')
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  async getCreditsSummary(@Query('search') search?: string) {
    return this.creditsService.getCreditsSummary(search);
  }

  @Get('customer/:customerId')
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  async getCustomerCreditDetails(@Param('customerId') customerId: string) {
    return this.creditsService.getCustomerCreditDetails(customerId);
  }

  @Post('payment')
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  async recordCreditPayment(
    @CurrentUser() staff: { id: string },
    @Body()
    dto: {
      ledgerId: string;
      amount: number;
      method: PaymentMethod;
      reference?: string;
    },
  ) {
    return this.creditsService.recordCreditPayment(
      dto.ledgerId,
      dto.amount,
      dto.method,
      dto.reference || null,
      staff.id,
    );
  }

  @Get('analytics')
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  async getCreditAnalytics() {
    return this.creditsService.getCreditAnalytics();
  }
}
