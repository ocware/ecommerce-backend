import { Body, Controller, HttpCode, HttpStatus, Param, ParseEnumPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { BackgroundJobQueue } from '../../../infrastructure/background/background-job-queue.service';
import { BackgroundJobName } from '../../../infrastructure/background/background-job.types';
import { PaymentGatewayName } from '../contracts/payment-gateway';

@ApiTags('payment webhooks')
@Controller({ path: 'payments/webhooks', version: '1' })
export class PaymentWebhooksController {
  constructor(private readonly backgroundJobs: BackgroundJobQueue) {}

  @Post(':gateway')
  @HttpCode(HttpStatus.ACCEPTED)
  processWebhook(
    @Param('gateway', new ParseEnumPipe(PaymentGatewayName)) gateway: PaymentGatewayName,
    @Body() payload: Record<string, unknown>,
  ) {
    return this.backgroundJobs.add(BackgroundJobName.PAYMENT_CALLBACK, { gateway, payload });
  }
}
