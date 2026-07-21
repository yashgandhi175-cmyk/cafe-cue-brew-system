import { Module } from '@nestjs/common';
import { TablesService } from './tables.service';
import { TablesController } from './tables.controller';
import { PublicTablesController } from './public-tables.controller';
import { WaiterCallsController } from './waiter-calls.controller';
import { FinancialCalculationService } from '../orders/financial-calculation.service';

@Module({
  controllers: [
    TablesController,
    PublicTablesController,
    WaiterCallsController,
  ],
  providers: [TablesService, FinancialCalculationService],
  exports: [TablesService],
})
export class TablesModule {}
