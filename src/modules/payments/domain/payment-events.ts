export type PaymentStarted = {
  name: 'PaymentStarted';
  occurredAt: Date;
  paymentAttemptId: string;
  orderId: string;
  gateway: string;
  amount: string;
  currency: string;
};

export type PaymentSucceeded = {
  name: 'PaymentSucceeded';
  occurredAt: Date;
  paymentAttemptId: string;
  orderId: string;
  gateway: string;
  transactionReference: string | null;
  amount: string;
  currency: string;
};

export type PaymentFailed = {
  name: 'PaymentFailed';
  occurredAt: Date;
  paymentAttemptId: string;
  orderId: string;
  gateway: string;
  failureCode: string | null;
};

export type RefundCompleted = {
  name: 'RefundCompleted';
  occurredAt: Date;
  refundId: string;
  paymentAttemptId: string;
  orderId: string;
  amount: string;
  currency: string;
};

export type PaymentDomainEvent =
  PaymentStarted | PaymentSucceeded | PaymentFailed | RefundCompleted;
