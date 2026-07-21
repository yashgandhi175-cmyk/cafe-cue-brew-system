import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyController } from './loyalty.controller';
import { CreditsService } from './credits.service';
import { CreditsController } from './credits.controller';

@Module({
  controllers: [CustomersController, LoyaltyController, CreditsController],
  providers: [CustomersService, LoyaltyService, CreditsService],
  exports: [CustomersService, LoyaltyService, CreditsService],
})
export class CustomersModule {}
