import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { FinancialCalculationService } from './financial-calculation.service';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PublicOrdersController } from './public-orders.controller';
import { StaffOrdersController } from './staff-orders.controller';
import { CartPricingService } from './cart-pricing.service';

@Module({
  controllers: [
    PublicOrdersController,
    StaffOrdersController,
    BillingController,
    PaymentsController,
  ],
  providers: [
    OrdersService,
    FinancialCalculationService,
    BillingService,
    PaymentsService,
    CartPricingService,
  ],
  exports: [
    OrdersService,
    FinancialCalculationService,
    BillingService,
    PaymentsService,
    CartPricingService,
  ],
})
export class OrdersModule {}
