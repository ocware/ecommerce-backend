import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminAnalyticsController } from './controllers/admin-analytics.controller';
import { StoreAnalyticsController } from './controllers/store-analytics.controller';
import { AnalyticsEventListener } from './services/analytics-event-listener.service';
import { AnalyticsService } from './services/analytics.service';

@Module({
  imports: [AuthModule, OrdersModule, PaymentsModule],
  controllers: [StoreAnalyticsController, AdminAnalyticsController],
  providers: [AnalyticsService, AnalyticsEventListener],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
