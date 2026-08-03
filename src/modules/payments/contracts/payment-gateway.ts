export enum PaymentGatewayName {
  DEVELOPMENT = 'DEVELOPMENT',
  MANUAL_BANK_TRANSFER = 'MANUAL_BANK_TRANSFER',
  CASH_ON_DELIVERY = 'CASH_ON_DELIVERY',
  ZARINPAL = 'ZARINPAL',
}

export type GatewayPaymentState = 'PENDING' | 'AUTHORIZED' | 'SUCCEEDED' | 'FAILED';
export type GatewayRefundState = 'PENDING' | 'SUCCEEDED' | 'FAILED';

export type CreateGatewayPaymentInput = {
  paymentAttemptId: string;
  orderId: string;
  orderNumber: string;
  amount: string;
  currency: string;
  callbackUrl?: string;
  customer: unknown;
};

export type GatewayPaymentResult = {
  state: GatewayPaymentState;
  gatewayReference: string;
  transactionReference?: string;
  redirectUrl?: string;
  eventId?: string;
  failureCode?: string;
  failureMessage?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type VerifyGatewayPaymentInput = {
  gatewayReference: string;
  amount: string;
  currency: string;
  payload: Record<string, unknown>;
  trusted: boolean;
};

export type GatewayWebhookResult = {
  eventId: string;
  gatewayReference: string;
  amount: string;
  currency: string;
  result: GatewayPaymentResult;
};

export type RefundGatewayPaymentInput = {
  gatewayReference: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
  reason?: string;
};

export type GatewayRefundResult = {
  state: GatewayRefundState;
  gatewayRefundReference?: string;
  failureCode?: string;
  failureMessage?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export interface PaymentGateway {
  readonly name: PaymentGatewayName;
  createPayment(input: CreateGatewayPaymentInput): Promise<GatewayPaymentResult>;
  verifyPayment(input: VerifyGatewayPaymentInput): Promise<GatewayPaymentResult>;
  handleWebhook(payload: Record<string, unknown>): Promise<GatewayWebhookResult>;
  refundPayment(input: RefundGatewayPaymentInput): Promise<GatewayRefundResult>;
}
