import { Body, Controller, Param, ParseEnumPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PaymentGatewayName } from '../contracts/payment-gateway';
import { PaymentsService } from '../services/payments.service';

@ApiTags('payment webhooks')
@Controller({ path: 'payments/webhooks', version: '1' })
export class PaymentWebhooksController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':gateway')
  processWebhook(
    @Param('gateway', new ParseEnumPipe(PaymentGatewayName)) gateway: PaymentGatewayName,
    @Body() payload: Record<string, unknown>,
  ) {
    return this.paymentsService.processWebhook(gateway, payload);
  }
}
