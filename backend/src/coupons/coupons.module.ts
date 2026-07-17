import { Module } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CouponsController } from './coupons.controller';
import { OrdersModule } from '../orders/orders.module';
import { PrismaService } from '../common/prisma.service';

@Module({
  imports: [OrdersModule],
  controllers: [CouponsController],
  providers: [CouponsService, PrismaService],
  exports: [CouponsService],
})
export class CouponsModule {}
