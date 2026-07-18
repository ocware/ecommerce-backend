import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PaymentGateway, PaymentGatewayName } from '../contracts/payment-gateway';
import { CashOnDeliveryGateway } from '../gateways/cash-on-delivery.gateway';
import { DevelopmentPaymentGateway } from '../gateways/development-payment.gateway';
import { ManualBankTransferGateway } from '../gateways/manual-bank-transfer.gateway';

@Injectable()
export class PaymentGatewayRegistry {
  private readonly gateways: Map<PaymentGatewayName, PaymentGateway>;

  constructor(
    config: ConfigService,
    development: DevelopmentPaymentGateway,
    manualBankTransfer: ManualBankTransferGateway,
    cashOnDelivery: CashOnDeliveryGateway,
  ) {
    const enabled = new Set(
      config.get<PaymentGatewayName[]>('app.paymentGateways', Object.values(PaymentGatewayName)),
    );
    this.gateways = new Map(
      [development, manualBankTransfer, cashOnDelivery]
        .filter((gateway) => enabled.has(gateway.name))
        .map((gateway) => [gateway.name, gateway]),
    );
  }

  get(name: PaymentGatewayName): PaymentGateway {
    const gateway = this.gateways.get(name);
    if (!gateway) {
      throw new BadRequestException({
        code: 'PAYMENT_GATEWAY_NOT_CONFIGURED',
        message: 'The selected payment gateway is not configured.',
      });
    }
    return gateway;
  }
}
