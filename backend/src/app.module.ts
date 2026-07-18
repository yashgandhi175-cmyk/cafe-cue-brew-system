import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from './common/prisma.module';
import { StaffModule } from './staff/staff.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { MenuModule } from './menu/menu.module';
import { TablesModule } from './tables/tables.module';
import { UploadsModule } from './uploads/uploads.module';
import { OrdersModule } from './orders/orders.module';
import { SettingsModule } from './settings/settings.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { InventoryModule } from './inventory/inventory.module';
import { ExpensesModule } from './expenses/expenses.module';
import { CustomersModule } from './customers/customers.module';
import { CouponsModule } from './coupons/coupons.module';
import { BannersModule } from './banners/banners.module';
import { MarketingModule } from './marketing/marketing.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    StaffModule,
    AuthModule,
    CategoriesModule,
    MenuModule,
    TablesModule,
    UploadsModule,
    OrdersModule,
    SettingsModule,
    AnalyticsModule,
    InventoryModule,
    ExpensesModule,
    CustomersModule,
    CouponsModule,
    BannersModule,
    MarketingModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120, // relaxed global limit to prevent normal HTTP polling from being blocked (120 reqs/min)
      },
    ]),
    ServeStaticModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          rootPath: join(
            process.cwd(),
            configService.get<string>('UPLOAD_DIR') || 'uploads',
          ),
          serveRoot: '/uploads',
        },
        {
          rootPath: (() => {
            const prodPath = join(__dirname, 'client');
            const devPath = join(process.cwd(), 'client');
            return require('fs').existsSync(prodPath) ? prodPath : devPath;
          })(),
          exclude: ['/api/(.*)'],
        },
      ],
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
