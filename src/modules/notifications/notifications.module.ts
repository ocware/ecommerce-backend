import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
import { CustomersModule } from '../customers/customers.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { ShippingModule } from '../shipping/shipping.module';
import { EMAIL_PROVIDER } from './contracts/email-provider';
import { SMS_PROVIDER } from './contracts/sms-provider';
import { AdminNotificationsController } from './controllers/admin-notifications.controller';
import { DevelopmentEmailProvider } from './providers/development-email.provider';
import { DevelopmentSmsProvider } from './providers/development-sms.provider';
import { NotificationDeliveryService } from './services/notification-delivery.service';
import { NotificationEventListener } from './services/notification-event-listener.service';

@Module({
  imports: [
    AuthModule,
    CustomersModule,
    InventoryModule,
    OrdersModule,
    PaymentsModule,
    ShippingModule,
  ],
  controllers: [AdminNotificationsController],
  providers: [
    DevelopmentEmailProvider,
    DevelopmentSmsProvider,
    {
      provide: EMAIL_PROVIDER,
      inject: [ConfigService, DevelopmentEmailProvider],
      useFactory: (config: ConfigService, development: DevelopmentEmailProvider) => {
        const provider = config.get<string>('app.emailProvider', 'development');
        if (provider === 'development') return development;
        throw new Error(`Unsupported email provider: ${provider}`);
      },
    },
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService, DevelopmentSmsProvider],
      useFactory: (config: ConfigService, development: DevelopmentSmsProvider) => {
        const provider = config.get<string>('app.smsProvider', 'development');
        if (provider === 'development') return development;
        throw new Error(`Unsupported SMS provider: ${provider}`);
      },
    },
    NotificationDeliveryService,
    NotificationEventListener,
  ],
  exports: [NotificationDeliveryService, EMAIL_PROVIDER, SMS_PROVIDER],
})
export class NotificationsModule {}
