import { ConfigService } from '@nestjs/config';

import { PaymentGatewayName } from '../contracts/payment-gateway';
import { CashOnDeliveryGateway } from '../gateways/cash-on-delivery.gateway';
import { DevelopmentPaymentGateway } from '../gateways/development-payment.gateway';
import { ManualBankTransferGateway } from '../gateways/manual-bank-transfer.gateway';
import { PaymentGatewayRegistry } from './payment-gateway-registry.service';

describe('PaymentGatewayRegistry', () => {
  const gateways = {
    development: { name: PaymentGatewayName.DEVELOPMENT } as DevelopmentPaymentGateway,
    manual: { name: PaymentGatewayName.MANUAL_BANK_TRANSFER } as ManualBankTransferGateway,
    cash: { name: PaymentGatewayName.CASH_ON_DELIVERY } as CashOnDeliveryGateway,
  };

  it('exposes only gateways enabled for the deployment', () => {
    const config = {
      get: () => [PaymentGatewayName.MANUAL_BANK_TRANSFER],
    } as unknown as ConfigService;
    const registry = new PaymentGatewayRegistry(
      config,
      gateways.development,
      gateways.manual,
      gateways.cash,
    );

    expect(registry.get(PaymentGatewayName.MANUAL_BANK_TRANSFER)).toBe(gateways.manual);
    expect(() => registry.get(PaymentGatewayName.DEVELOPMENT)).toThrow(
      'The selected payment gateway is not configured.',
    );
  });
});
