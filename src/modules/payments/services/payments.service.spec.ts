import {
  PaymentAttemptStatus,
  PaymentCallbackStatus,
  PaymentRefundStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { StaffRole } from '../../auth/types/staff-role';
import { OrdersService } from '../../orders/services/orders.service';
import { GatewayWebhookResult, PaymentGatewayName } from '../contracts/payment-gateway';
import { PaymentEventPublisher } from './payment-event-publisher.service';
import { PaymentGatewayRegistry } from './payment-gateway-registry.service';
import { PaymentsService } from './payments.service';

describe('PaymentsService callback idempotency', () => {
  const now = new Date();
  const attempt = {
    id: '11111111-1111-4111-8111-111111111111',
    orderId: '22222222-2222-4222-8222-222222222222',
    gateway: PaymentGatewayName.DEVELOPMENT,
    idempotencyKey: 'payment-key-123',
    status: PaymentAttemptStatus.PENDING,
    amount: new Prisma.Decimal('40.00'),
    currency: 'USD',
    gatewayReference: 'dev-reference',
    redirectUrl: null,
    failureCode: null,
    failureMessage: null,
    metadata: null,
    startedAt: now,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    transactions: [],
    refunds: [],
  };
  let callback:
    | {
        id: string;
        gateway: string;
        externalEventId: string;
        gatewayReference: string;
        status: PaymentCallbackStatus;
        payload: object;
        errorCode: string | null;
        errorMessage: string | null;
        processedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }
    | undefined;
  const prisma = {
    paymentAttempt: {
      findUnique: jest.fn(() => attempt),
      update: jest.fn((input: { data: { status: PaymentAttemptStatus; completedAt?: Date } }) => ({
        ...attempt,
        status: input.data.status,
        completedAt: input.data.completedAt ?? null,
      })),
    },
    paymentCallback: {
      findUnique: jest.fn(() => callback ?? null),
      findUniqueOrThrow: jest.fn(() => callback),
      create: jest.fn(
        (input: {
          data: {
            gateway: string;
            externalEventId: string;
            gatewayReference: string;
            payload: object;
          };
        }) => {
          callback = {
            id: 'callback-id',
            ...input.data,
            status: PaymentCallbackStatus.PROCESSING,
            errorCode: null,
            errorMessage: null,
            processedAt: null,
            createdAt: now,
            updatedAt: now,
          };
          return callback;
        },
      ),
      update: jest.fn(
        (input: {
          data: {
            status: PaymentCallbackStatus;
            processedAt?: Date;
            errorCode?: string | null;
            errorMessage?: string | null;
          };
        }) => {
          if (!callback) throw new Error('Callback not created.');
          callback.status = input.data.status;
          callback.processedAt = input.data.processedAt ?? callback.processedAt;
          callback.errorCode = input.data.errorCode ?? callback.errorCode;
          callback.errorMessage = input.data.errorMessage ?? callback.errorMessage;
          return callback;
        },
      ),
    },
    paymentTransaction: { create: jest.fn(() => ({ id: 'transaction-id' })) },
  };
  const ordersService = {
    markPaymentSucceeded: jest.fn(() => Promise.resolve({ paymentStatus: 'PAID' })),
    markPaymentFailed: jest.fn(() => Promise.resolve({ paymentStatus: 'FAILED' })),
  };
  const gateway = {
    handleWebhook: jest.fn((): Promise<GatewayWebhookResult> =>
      Promise.resolve({
        eventId: 'gateway-event-1',
        gatewayReference: attempt.gatewayReference,
        amount: '40.00',
        currency: 'USD',
        result: {
          state: 'SUCCEEDED' as const,
          gatewayReference: attempt.gatewayReference,
          transactionReference: 'gateway-transaction-1',
          eventId: 'gateway-event-1',
        },
      }),
    ),
  };
  const registry = { get: jest.fn(() => gateway) };
  const eventPublisher = { publish: jest.fn() };
  const settingsService = {
    get: jest.fn(() =>
      Promise.resolve({
        onlinePaymentEnabled: true,
        codPaymentEnabled: true,
      }),
    ),
  };
  const service = new PaymentsService(
    prisma as unknown as PrismaService,
    ordersService as unknown as OrdersService,
    registry as unknown as PaymentGatewayRegistry,
    eventPublisher as unknown as PaymentEventPublisher,
    settingsService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    callback = undefined;
  });

  it('processes a verified webhook once and returns duplicate success for retries', async () => {
    const payload = { eventId: 'gateway-event-1', signature: 'verified-by-adapter' };

    await service.processWebhook(PaymentGatewayName.DEVELOPMENT, payload);
    const duplicate = await service.processWebhook(PaymentGatewayName.DEVELOPMENT, payload);

    expect(prisma.paymentTransaction.create).toHaveBeenCalledTimes(1);
    expect(ordersService.markPaymentSucceeded).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'PaymentSucceeded', orderId: attempt.orderId }),
    );
    expect(duplicate).toMatchObject({ id: attempt.id, duplicate: true });
    expect(callback?.status).toBe(PaymentCallbackStatus.PROCESSED);
  });

  it('records verified payment failures and releases the order through its module API', async () => {
    gateway.handleWebhook.mockResolvedValueOnce({
      eventId: 'gateway-event-failed',
      gatewayReference: attempt.gatewayReference,
      amount: '40.00',
      currency: 'USD',
      result: {
        state: 'FAILED',
        gatewayReference: attempt.gatewayReference,
        eventId: 'gateway-event-failed',
        failureCode: 'GATEWAY_DECLINED',
        failureMessage: 'Declined',
      },
    });

    await service.processWebhook(PaymentGatewayName.DEVELOPMENT, {
      eventId: 'gateway-event-failed',
    });

    expect(ordersService.markPaymentFailed).toHaveBeenCalledWith(attempt.orderId);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'PaymentFailed', failureCode: 'GATEWAY_DECLINED' }),
    );
  });
});

describe('PaymentsService partial refunds', () => {
  const now = new Date();
  const attempt = {
    id: '33333333-3333-4333-8333-333333333333',
    orderId: '44444444-4444-4444-8444-444444444444',
    gateway: PaymentGatewayName.DEVELOPMENT,
    idempotencyKey: 'payment-key-456',
    status: PaymentAttemptStatus.SUCCEEDED,
    amount: new Prisma.Decimal('100.00'),
    currency: 'USD',
    gatewayReference: 'dev-reference-2',
    redirectUrl: null,
    failureCode: null,
    failureMessage: null,
    metadata: null,
    startedAt: now,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
    transactions: [],
    refunds: [],
  };
  const refund = {
    id: '55555555-5555-4555-8555-555555555555',
    paymentAttemptId: attempt.id,
    orderId: attempt.orderId,
    requestedByStaffUserId: 'staff-id',
    idempotencyKey: 'refund-key-123',
    status: PaymentRefundStatus.PENDING,
    amount: new Prisma.Decimal('25.00'),
    currency: 'USD',
    reason: 'Partial return',
    gatewayRefundReference: null,
    failureCode: null,
    failureMessage: null,
    metadata: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const transaction = {
    paymentRefund: {
      aggregate: jest.fn(() => ({ _sum: { amount: null } })),
      create: jest.fn(() => refund),
    },
  };
  const prisma = {
    paymentRefund: {
      findUnique: jest.fn(() => null),
      update: jest.fn(() => ({
        ...refund,
        status: PaymentRefundStatus.SUCCEEDED,
        gatewayRefundReference: 'gateway-refund-1',
        completedAt: now,
      })),
      aggregate: jest.fn(() => ({ _sum: { amount: new Prisma.Decimal('25.00') } })),
    },
    paymentAttempt: { findUnique: jest.fn(() => attempt) },
    paymentTransaction: { create: jest.fn(() => ({ id: 'refund-transaction-id' })) },
    $transaction: jest.fn((operation: (client: typeof transaction) => Promise<unknown>) =>
      operation(transaction),
    ),
  };
  const ordersService = {
    getPaymentOrderForAdmin: jest.fn(() => Promise.resolve({ id: attempt.orderId })),
    markRefunded: jest.fn(() => Promise.resolve({ refundStatus: 'PARTIAL' })),
  };
  const gateway = {
    refundPayment: jest.fn(() =>
      Promise.resolve({
        state: 'SUCCEEDED' as const,
        gatewayRefundReference: 'gateway-refund-1',
      }),
    ),
  };
  const registry = { get: jest.fn(() => gateway) };
  const eventPublisher = { publish: jest.fn() };
  const settingsService = {
    get: jest.fn(() =>
      Promise.resolve({
        onlinePaymentEnabled: true,
        codPaymentEnabled: true,
      }),
    ),
  };
  const service = new PaymentsService(
    prisma as unknown as PrismaService,
    ordersService as unknown as OrdersService,
    registry as unknown as PaymentGatewayRegistry,
    eventPublisher as unknown as PaymentEventPublisher,
    settingsService as never,
  );

  it('records a partial refund transaction and updates the order refund total', async () => {
    const result = await service.createRefund(
      attempt.id,
      { amount: '25.00', reason: 'Partial return' },
      refund.idempotencyKey,
      {
        id: 'staff-id',
        email: 'staff@example.test',
        name: 'Staff',
        role: StaffRole.ORDER_MANAGER,
        sessionId: 'session-id',
      },
    );

    expect(result).toMatchObject({ status: PaymentRefundStatus.SUCCEEDED, amount: '25.00' });
    expect(prisma.paymentTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'REFUND', amount: refund.amount }) as Record<
          string,
          unknown
        >,
      }),
    );
    expect(ordersService.markRefunded).toHaveBeenCalledWith(attempt.orderId, '25.00');
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'RefundCompleted', amount: '25.00' }),
    );
  });
});
