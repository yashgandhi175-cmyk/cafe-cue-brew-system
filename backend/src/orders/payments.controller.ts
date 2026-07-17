import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Role, PaymentMethod } from '@prisma/client';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post()
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  async recordPayment(
    @CurrentUser() staff: { id: string; role: Role },
    @Body()
    dto: {
      billId: string;
      method: PaymentMethod;
      amount: number;
      amountTendered?: number;
      reference?: string;
      paymentIdempotencyKey?: string;
    },
  ) {
    return this.paymentsService.recordPayment(staff.id, staff.role, dto);
  }
}
