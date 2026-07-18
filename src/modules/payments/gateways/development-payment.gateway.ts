import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CreateGatewayPaymentInput,
  GatewayPaymentResult,
  GatewayWebhookResult,
  PaymentGateway,
  PaymentGatewayName,
  RefundGatewayPaymentInput,
  VerifyGatewayPaymentInput,
} from '../contracts/payment-gateway';

@Injectable()
export class DevelopmentPaymentGateway implements PaymentGateway {
  readonly name = PaymentGatewayName.DEVELOPMENT;

  constructor(private readonly config: ConfigService) {}

  createPayment(input: CreateGatewayPaymentInput): Promise<GatewayPaymentResult> {
    const gatewayReference = `dev_${randomUUID()}`;
    const redirectUrl = input.callbackUrl
      ? this.appendQuery(input.callbackUrl, 'reference', gatewayReference)
      : undefined;
    return Promise.resolve({
      state: 'PENDING',
      gatewayReference,
      redirectUrl,
      metadata: { simulated: true },
    });
  }

  verifyPayment(input: VerifyGatewayPaymentInput): Promise<GatewayPaymentResult> {
    return Promise.resolve().then(() => {
      const parsed = this.parseSignedPayload(input.payload);
      if (
        parsed.gatewayReference !== input.gatewayReference ||
        parsed.amount !== input.amount ||
        parsed.currency !== input.currency
      ) {
        throw new BadRequestException({
          code: 'PAYMENT_VERIFICATION_MISMATCH',
          message: 'The payment verification details do not match the payment attempt.',
        });
      }
      return this.toResult(parsed);
    });
  }

  handleWebhook(payload: Record<string, unknown>): Promise<GatewayWebhookResult> {
    return Promise.resolve().then(() => {
      const parsed = this.parseSignedPayload(payload);
      return {
        eventId: parsed.eventId,
        gatewayReference: parsed.gatewayReference,
        amount: parsed.amount,
        currency: parsed.currency,
        result: this.toResult(parsed),
      };
    });
  }

  refundPayment(input: RefundGatewayPaymentInput) {
    return Promise.resolve({
      state: 'SUCCEEDED' as const,
      gatewayRefundReference: `dev_refund_${this.digest(input.idempotencyKey).slice(0, 24)}`,
      metadata: { simulated: true },
    });
  }

  private parseSignedPayload(payload: Record<string, unknown>) {
    const eventId = this.requireString(payload, 'eventId');
    const gatewayReference = this.requireString(payload, 'gatewayReference');
    const status = this.requireString(payload, 'status');
    const transactionReference = this.optionalString(payload, 'transactionReference');
    const amount = this.requireString(payload, 'amount');
    const currency = this.requireString(payload, 'currency');
    const signature = this.requireString(payload, 'signature');
    if (!['PENDING', 'SUCCEEDED', 'FAILED'].includes(status)) {
      throw new BadRequestException({
        code: 'INVALID_PAYMENT_STATUS',
        message: 'The gateway payment status is invalid.',
      });
    }
    const expected = this.sign(
      eventId,
      gatewayReference,
      status,
      transactionReference ?? '',
      amount,
      currency,
    );
    if (!this.matchesSignature(signature, expected)) {
      throw new UnauthorizedException({
        code: 'INVALID_PAYMENT_SIGNATURE',
        message: 'The payment signature is invalid.',
      });
    }
    return { eventId, gatewayReference, status, transactionReference, amount, currency };
  }

  private toResult(parsed: ReturnType<DevelopmentPaymentGateway['parseSignedPayload']>) {
    return {
      state: parsed.status as 'PENDING' | 'SUCCEEDED' | 'FAILED',
      gatewayReference: parsed.gatewayReference,
      transactionReference: parsed.transactionReference,
      eventId: parsed.eventId,
      failureCode: parsed.status === 'FAILED' ? 'GATEWAY_DECLINED' : undefined,
      failureMessage:
        parsed.status === 'FAILED' ? 'The simulated payment was declined.' : undefined,
      metadata: { verifiedSignature: true },
    };
  }

  private sign(...parts: string[]): string {
    return createHmac('sha256', this.secret()).update(parts.join('|')).digest('hex');
  }

  private digest(value: string): string {
    return createHmac('sha256', this.secret()).update(value).digest('hex');
  }

  private matchesSignature(provided: string, expected: string): boolean {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    return (
      providedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(providedBuffer, expectedBuffer)
    );
  }

  private secret(): string {
    return this.config.getOrThrow<string>('app.paymentWebhookSecret');
  }

  private requireString(payload: Record<string, unknown>, key: string): string {
    const value = payload[key];
    if (typeof value !== 'string' || !value.length) {
      throw new BadRequestException({
        code: 'INVALID_GATEWAY_PAYLOAD',
        message: `Gateway payload field ${key} is required.`,
      });
    }
    return value;
  }

  private optionalString(payload: Record<string, unknown>, key: string): string | undefined {
    const value = payload[key];
    return typeof value === 'string' && value.length ? value : undefined;
  }

  private appendQuery(url: string, key: string, value: string): string {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
}
