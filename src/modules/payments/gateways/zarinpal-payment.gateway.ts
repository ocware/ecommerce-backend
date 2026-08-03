import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CreateGatewayPaymentInput,
  GatewayPaymentResult,
  PaymentGateway,
  PaymentGatewayName,
  RefundGatewayPaymentInput,
  VerifyGatewayPaymentInput,
} from '../contracts/payment-gateway';

type ZarinpalResponse = {
  data?: {
    code?: number;
    authority?: string;
    ref_id?: number;
    card_pan?: string;
    card_hash?: string;
    fee?: number;
  };
  errors?: unknown;
};

@Injectable()
export class ZarinpalPaymentGateway implements PaymentGateway {
  readonly name = PaymentGatewayName.ZARINPAL;

  constructor(private readonly config: ConfigService) {}

  async createPayment(input: CreateGatewayPaymentInput): Promise<GatewayPaymentResult> {
    if (input.currency !== 'IRR') {
      throw new BadRequestException({
        code: 'ZARINPAL_CURRENCY_UNSUPPORTED',
        message: 'Zarinpal payments require IRR.',
      });
    }
    if (!input.callbackUrl) {
      throw new BadRequestException({
        code: 'PAYMENT_CALLBACK_REQUIRED',
        message: 'A payment callback URL is required.',
      });
    }
    const result = await this.request('/pg/v4/payment/request.json', {
      merchant_id: this.merchantId(),
      amount: this.safeRialAmount(input.amount),
      callback_url: this.callbackUrl(input.callbackUrl, input.paymentAttemptId, input.orderId),
      description: `پرداخت سفارش ${input.orderNumber}`,
      metadata: this.customerMetadata(input.customer),
    });
    if (result.data?.code !== 100 || !result.data.authority) {
      throw new BadGatewayException({
        code: 'ZARINPAL_REQUEST_REJECTED',
        message: 'Zarinpal rejected the payment request.',
        details: { providerCode: result.data?.code },
      });
    }
    const authority = result.data.authority;
    return {
      state: 'PENDING',
      gatewayReference: authority,
      redirectUrl: `${this.checkoutOrigin()}/pg/StartPay/${encodeURIComponent(authority)}`,
      metadata: { providerCode: result.data.code },
    };
  }

  async verifyPayment(input: VerifyGatewayPaymentInput): Promise<GatewayPaymentResult> {
    const authority = this.string(input.payload.Authority ?? input.payload.authority);
    const status = this.string(input.payload.Status ?? input.payload.status).toUpperCase();
    if (authority !== input.gatewayReference) {
      throw new BadRequestException({
        code: 'PAYMENT_VERIFICATION_MISMATCH',
        message: 'The Zarinpal authority does not match the payment attempt.',
      });
    }
    if (status && status !== 'OK') {
      return {
        state: 'FAILED',
        gatewayReference: authority,
        eventId: `zarinpal:${authority}:cancelled`,
        failureCode: 'PAYMENT_CANCELLED',
        failureMessage: 'The customer cancelled or did not complete payment.',
      };
    }
    const result = await this.request('/pg/v4/payment/verify.json', {
      merchant_id: this.merchantId(),
      amount: this.safeRialAmount(input.amount),
      authority,
    });
    const code = result.data?.code;
    if ((code === 100 || code === 101) && result.data?.ref_id !== undefined) {
      return {
        state: 'SUCCEEDED',
        gatewayReference: authority,
        transactionReference: String(result.data.ref_id),
        eventId: `zarinpal:${authority}:${result.data.ref_id}`,
        metadata: {
          providerCode: code,
          cardPan: result.data.card_pan ?? null,
          cardHash: result.data.card_hash ?? null,
          fee: result.data.fee ?? null,
        },
      };
    }
    return {
      state: 'FAILED',
      gatewayReference: authority,
      eventId: `zarinpal:${authority}:failed:${code ?? 'unknown'}`,
      failureCode: `ZARINPAL_${code ?? 'UNKNOWN'}`,
      failureMessage: 'Zarinpal could not verify the payment.',
      metadata: { providerCode: code ?? 0 },
    };
  }

  handleWebhook(): Promise<never> {
    return Promise.reject(
      new BadRequestException({
        code: 'ZARINPAL_WEBHOOK_UNSUPPORTED',
        message: 'Zarinpal is verified through the signed return flow.',
      }),
    );
  }

  refundPayment(input: RefundGatewayPaymentInput) {
    void input;
    return Promise.resolve({
      state: 'FAILED' as const,
      failureCode: 'ZARINPAL_REFUND_REQUIRES_MANUAL_REVIEW',
      failureMessage:
        'Automated Zarinpal refunds require a separately approved refund/reversal contract.',
    });
  }

  private async request(path: string, body: Record<string, unknown>): Promise<ZarinpalResponse> {
    const response = await fetch(`${this.apiOrigin()}${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const result = (await response.json().catch(() => ({}))) as ZarinpalResponse;
    if (!response.ok) {
      throw new BadGatewayException({
        code: 'ZARINPAL_UNAVAILABLE',
        message: 'Zarinpal is temporarily unavailable.',
        details: { status: response.status },
      });
    }
    return result;
  }

  private safeRialAmount(amount: string): number {
    if (!/^\d+(\.0+)?$/.test(amount)) {
      throw new BadRequestException({
        code: 'INVALID_PAYMENT_AMOUNT',
        message: 'Zarinpal requires a whole-rial amount.',
      });
    }
    const value = BigInt(amount.split('.')[0]);
    if (value <= BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new BadRequestException({
        code: 'INVALID_PAYMENT_AMOUNT',
        message: 'The payment amount is outside the supported range.',
      });
    }
    return Number(value);
  }

  private customerMetadata(customer: unknown): Record<string, string> | undefined {
    if (!customer || typeof customer !== 'object') return undefined;
    const raw = customer as Record<string, unknown>;
    const mobile = this.string(raw.phone);
    const email = this.string(raw.email);
    return mobile || email
      ? { ...(mobile ? { mobile } : {}), ...(email ? { email } : {}) }
      : undefined;
  }

  private callbackUrl(url: string, attemptId: string, orderId: string): string {
    const callback = new URL(url);
    callback.searchParams.set('attempt_id', attemptId);
    callback.searchParams.set('order_id', orderId);
    return callback.toString();
  }

  private string(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private merchantId(): string {
    return this.config.getOrThrow<string>('app.zarinpalMerchantId');
  }

  private apiOrigin(): string {
    return this.config.get<boolean>('app.zarinpalSandbox', false)
      ? 'https://sandbox.zarinpal.com'
      : 'https://api.zarinpal.com';
  }

  private checkoutOrigin(): string {
    return this.config.get<boolean>('app.zarinpalSandbox', false)
      ? 'https://sandbox.zarinpal.com'
      : 'https://www.zarinpal.com';
  }
}
