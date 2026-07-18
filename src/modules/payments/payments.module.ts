import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CustomersModule } from '../customers/customers.module';
import { OrdersModule } from '../orders/orders.module';
import { AdminPaymentsController } from './controllers/admin-payments.controller';
import { PaymentWebhooksController } from './controllers/payment-webhooks.controller';
import { StoreGuestPaymentsController } from './controllers/store-guest-payments.controller';
import { StorePaymentsController } from './controllers/store-payments.controller';
import { CashOnDeliveryGateway } from './gateways/cash-on-delivery.gateway';
import { DevelopmentPaymentGateway } from './gateways/development-payment.gateway';
import { ManualBankTransferGateway } from './gateways/manual-bank-transfer.gateway';
import { PaymentEventPublisher } from './services/payment-event-publisher.service';
import { PaymentGatewayRegistry } from './services/payment-gateway-registry.service';
import { PaymentsService } from './services/payments.service';

@Module({
  imports: [AuthModule, CustomersModule, OrdersModule],
  controllers: [
    StorePaymentsController,
    StoreGuestPaymentsController,
    AdminPaymentsController,
    PaymentWebhooksController,
  ],
  providers: [
    PaymentsService,
    PaymentEventPublisher,
    PaymentGatewayRegistry,
    DevelopmentPaymentGateway,
    ManualBankTransferGateway,
    CashOnDeliveryGateway,
  ],
  exports: [PaymentsService, PaymentEventPublisher, PaymentGatewayRegistry],
})
export class PaymentsModule {}
