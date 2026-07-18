import { Module } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CouponsController } from './coupons.controller';
import { OrdersModule } from '../orders/orders.module';
import { PrismaModule } from '../common/prisma.module';

@Module({
  imports: [OrdersModule, PrismaModule],
  controllers: [CouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
