import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { appConfig } from '../config/app.config';
import { validateEnvironment } from '../config/env.validation';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { RedisModule } from '../infrastructure/redis/redis.module';
import { AuthModule } from '../modules/auth/auth.module';
import { CartModule } from '../modules/cart/cart.module';
import { CatalogModule } from '../modules/catalog/catalog.module';
import { CustomersModule } from '../modules/customers/customers.module';
import { DiscountsModule } from '../modules/discounts/discounts.module';
import { InventoryModule } from '../modules/inventory/inventory.module';
import { MediaModule } from '../modules/media/media.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { OrdersModule } from '../modules/orders/orders.module';
import { PaymentsModule } from '../modules/payments/payments.module';
import { ReportsModule } from '../modules/reports/reports.module';
import { SettingsModule } from '../modules/settings/settings.module';
import { ShippingModule } from '../modules/shipping/shipping.module';
import { UsersModule } from '../modules/users/users.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    RedisModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    CatalogModule,
    InventoryModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    ShippingModule,
    DiscountsModule,
    NotificationsModule,
    MediaModule,
    SettingsModule,
    ReportsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
