import { randomUUID } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';

import {
  CreateGatewayPaymentInput,
  PaymentGateway,
  PaymentGatewayName,
  RefundGatewayPaymentInput,
  VerifyGatewayPaymentInput,
} from '../contracts/payment-gateway';

@Injectable()
export class CashOnDeliveryGateway implements PaymentGateway {
  readonly name = PaymentGatewayName.CASH_ON_DELIVERY;

  createPayment(input: CreateGatewayPaymentInput) {
    void input;
    const gatewayReference = `cod_${randomUUID()}`;
    return Promise.resolve({
      state: 'AUTHORIZED' as const,
      gatewayReference,
      transactionReference: gatewayReference,
      eventId: `cod:${gatewayReference}:authorized`,
      metadata: { collectOnDelivery: true },
    });
  }

  verifyPayment(input: VerifyGatewayPaymentInput) {
    return Promise.resolve({
      state: 'AUTHORIZED' as const,
      gatewayReference: input.gatewayReference,
      transactionReference: input.gatewayReference,
      eventId: `cod:${input.gatewayReference}:authorized`,
      metadata: { collectOnDelivery: true },
    });
  }

  handleWebhook(payload: Record<string, unknown>): Promise<never> {
    void payload;
    throw new BadRequestException({
      code: 'GATEWAY_WEBHOOK_NOT_SUPPORTED',
      message: 'Cash on delivery does not support webhooks.',
    });
  }

  refundPayment(input: RefundGatewayPaymentInput) {
    return Promise.resolve({
      state: 'SUCCEEDED' as const,
      gatewayRefundReference: `cod_refund_${input.idempotencyKey}`,
    });
  }
}
