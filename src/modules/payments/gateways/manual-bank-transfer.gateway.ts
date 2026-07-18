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
export class ManualBankTransferGateway implements PaymentGateway {
  readonly name = PaymentGatewayName.MANUAL_BANK_TRANSFER;

  createPayment(input: CreateGatewayPaymentInput) {
    void input;
    return Promise.resolve({
      state: 'PENDING' as const,
      gatewayReference: `manual_${randomUUID()}`,
      metadata: { instructions: 'Awaiting administrative bank-transfer confirmation.' },
    });
  }

  verifyPayment(input: VerifyGatewayPaymentInput) {
    if (!input.trusted) {
      throw new BadRequestException({
        code: 'MANUAL_PAYMENT_REQUIRES_ADMIN_VERIFICATION',
        message: 'Manual bank transfers must be verified by authorized staff.',
      });
    }
    const approved = input.payload.approved === true;
    return Promise.resolve({
      state: approved ? ('SUCCEEDED' as const) : ('FAILED' as const),
      gatewayReference: input.gatewayReference,
      transactionReference:
        typeof input.payload.transactionReference === 'string'
          ? input.payload.transactionReference
          : `manual_verification_${input.gatewayReference}`,
      eventId: `manual:${input.gatewayReference}:${approved ? 'approved' : 'rejected'}`,
      failureCode: approved ? undefined : 'MANUAL_PAYMENT_REJECTED',
      failureMessage: approved ? undefined : 'The bank transfer was not approved.',
    });
  }

  handleWebhook(payload: Record<string, unknown>): Promise<never> {
    void payload;
    throw new BadRequestException({
      code: 'GATEWAY_WEBHOOK_NOT_SUPPORTED',
      message: 'Manual bank transfers do not support webhooks.',
    });
  }

  refundPayment(input: RefundGatewayPaymentInput) {
    return Promise.resolve({
      state: 'SUCCEEDED' as const,
      gatewayRefundReference: `manual_refund_${input.idempotencyKey}`,
    });
  }
}
