import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';

import { appConfig } from '../config/app.config';
import { validateEnvironment } from '../config/env.validation';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { BackgroundQueueModule } from '../infrastructure/background/background-queue.module';
import { RedisModule } from '../infrastructure/redis/redis.module';
import { AuthModule } from '../modules/auth/auth.module';
import { AnalyticsModule } from '../modules/analytics/analytics.module';
import { CartModule } from '../modules/cart/cart.module';
import { CmsModule } from '../modules/cms/cms.module';
import { CatalogModule } from '../modules/catalog/catalog.module';
import { CustomersModule } from '../modules/customers/customers.module';
import { DiscountsModule } from '../modules/discounts/discounts.module';
import { EngagementModule } from '../modules/engagement/engagement.module';
import { InventoryModule } from '../modules/inventory/inventory.module';
import { MediaModule } from '../modules/media/media.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { OrdersModule } from '../modules/orders/orders.module';
import { PaymentsModule } from '../modules/payments/payments.module';
import { ReportsModule } from '../modules/reports/reports.module';
import { ReturnsModule } from '../modules/returns/returns.module';
import { SettingsModule } from '../modules/settings/settings.module';
import { ShippingModule } from '../modules/shipping/shipping.module';
import { UsersModule } from '../modules/users/users.module';
import { EventsModule } from '../shared/events/events.module';
import { CommunicationsModule } from '../shared/communications/communications.module';
import { FeaturesModule } from '../shared/features/features.module';
import { createAppValidationPipe } from '../shared/validation/app-validation.pipe';
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
    BackgroundQueueModule,
    EventsModule,
    CommunicationsModule,
    FeaturesModule,
    AuthModule,
    AnalyticsModule,
    UsersModule,
    CustomersModule,
    CatalogModule,
    InventoryModule,
    CartModule,
    CmsModule,
    OrdersModule,
    PaymentsModule,
    ShippingModule,
    DiscountsModule,
    EngagementModule,
    NotificationsModule,
    MediaModule,
    SettingsModule,
    ReportsModule,
    ReturnsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_PIPE, useFactory: createAppValidationPipe }],
})
export class AppModule {}
