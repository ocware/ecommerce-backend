import { Injectable } from '@nestjs/common';

import { PaymentsService } from '../../../modules/payments/services/payments.service';
import { BackgroundJobPayloads, BackgroundJobName } from '../background-job.types';

@Injectable()
export class PaymentCallbackJob {
  constructor(private readonly payments: PaymentsService) {}

  handle(data: BackgroundJobPayloads[BackgroundJobName.PAYMENT_CALLBACK]) {
    return this.payments.processWebhook(data.gateway, data.payload);
  }
}
