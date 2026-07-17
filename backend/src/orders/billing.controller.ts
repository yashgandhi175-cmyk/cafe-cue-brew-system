import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Post('orders/:orderId/finalize')
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  async finalizeBill(
    @Param('orderId') orderId: string,
    @CurrentUser() staff: { id: string },
  ) {
    return this.billingService.finalizeBill(orderId, staff.id);
  }

  @Post('orders/:orderId/discount')
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  async applyDiscount(
    @Param('orderId') orderId: string,
    @CurrentUser() staff: { id: string; role: Role },
    @Body() dto: { type: 'FLAT' | 'PERCENTAGE'; value: number; reason: string },
  ) {
    return this.billingService.applyManualDiscount(
      orderId,
      staff.id,
      staff.role,
      dto,
    );
  }

  @Post('coupons/validate')
  async validateCoupon(
    @Body() dto: { code: string; subtotal: number; customerId?: string },
  ) {
    return this.billingService.validateCoupon(
      dto.code,
      dto.subtotal,
      dto.customerId,
    );
  }
}
