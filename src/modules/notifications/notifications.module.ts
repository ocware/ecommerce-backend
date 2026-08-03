import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CommunicationsModule } from '../../shared/communications/communications.module';
import { AuthModule } from '../auth/auth.module';
import { CustomersModule } from '../customers/customers.module';
import { EngagementModule } from '../engagement/engagement.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { ShippingModule } from '../shipping/shipping.module';
import { EMAIL_PROVIDER } from './contracts/email-provider';
import { AdminNotificationsController } from './controllers/admin-notifications.controller';
import { DevelopmentEmailProvider } from './providers/development-email.provider';
import { SmtpEmailProvider } from './providers/smtp-email.provider';
import { NotificationDeliveryService } from './services/notification-delivery.service';
import { NotificationEventListener } from './services/notification-event-listener.service';

@Module({
  imports: [
    AuthModule,
    CustomersModule,
    EngagementModule,
    InventoryModule,
    OrdersModule,
    PaymentsModule,
    ShippingModule,
    CommunicationsModule,
  ],
  controllers: [AdminNotificationsController],
  providers: [
    DevelopmentEmailProvider,
    SmtpEmailProvider,
    {
      provide: EMAIL_PROVIDER,
      inject: [ConfigService, DevelopmentEmailProvider, SmtpEmailProvider],
      useFactory: (
        config: ConfigService,
        development: DevelopmentEmailProvider,
        smtp: SmtpEmailProvider,
      ) => {
        const provider = config.get<string>('app.emailProvider', 'development');
        if (provider === 'development') return development;
        if (provider === 'smtp') return smtp;
        throw new Error(`Unsupported email provider: ${provider}`);
      },
    },
    NotificationDeliveryService,
    NotificationEventListener,
  ],
  exports: [NotificationDeliveryService, EMAIL_PROVIDER],
})
export class NotificationsModule {}
