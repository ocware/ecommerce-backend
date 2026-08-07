import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentCallbackStatus,
  PaymentRefundStatus,
  PaymentTransactionKind,
  PaymentTransactionStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AuthenticatedStaff } from '../../auth/types/authenticated-staff';
import { AuthenticatedCustomer } from '../../customers/types/authenticated-customer';
import { OrdersService, PaymentOrderView } from '../../orders/services/orders.service';
import { SettingsService } from '../../settings/services/settings.service';
import {
  GatewayPaymentResult,
  GatewayRefundResult,
  PaymentGatewayName,
} from '../contracts/payment-gateway';
import { CreateRefundDto } from '../dto/create-refund.dto';
import { StartPaymentDto } from '../dto/start-payment.dto';
import { VerifyPaymentDto } from '../dto/verify-payment.dto';
import { PaymentEventPublisher } from './payment-event-publisher.service';
import { PaymentGatewayRegistry } from './payment-gateway-registry.service';

const attemptInclude = Prisma.validator<Prisma.PaymentAttemptInclude>()({
  transactions: { orderBy: { occurredAt: 'asc' } },
  refunds: { orderBy: { createdAt: 'asc' } },
});
type AttemptRecord = Prisma.PaymentAttemptGetPayload<{ include: typeof attemptInclude }>;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly gatewayRegistry: PaymentGatewayRegistry,
    private readonly eventPublisher: PaymentEventPublisher,
    private readonly settingsService: SettingsService,
  ) {}

  async startCustomerPayment(
    orderId: string,
    dto: StartPaymentDto,
    idempotencyKey: string | undefined,
    customer: AuthenticatedCustomer,
  ) {
    const order = await this.ordersService.getPaymentOrderForCustomer(orderId, customer);
    return this.startPayment(order, dto, this.requireIdempotencyKey(idempotencyKey));
  }

  async startGuestPayment(
    orderId: string,
    dto: StartPaymentDto,
    idempotencyKey: string | undefined,
    guestToken?: string,
  ) {
    const order = await this.ordersService.getPaymentOrderForGuest(orderId, guestToken);
    return this.startPayment(order, dto, this.requireIdempotencyKey(idempotencyKey));
  }

  async getCustomerAttempt(id: string, customer: AuthenticatedCustomer) {
    const attempt = await this.requireAttempt(id);
    await this.ordersService.getPaymentOrderForCustomer(attempt.orderId, customer);
    return this.serializeAttempt(attempt);
  }

  async getGuestAttempt(id: string, guestToken?: string) {
    const attempt = await this.requireAttempt(id);
    await this.ordersService.getPaymentOrderForGuest(attempt.orderId, guestToken);
    return this.serializeAttempt(attempt);
  }

  async verifyCustomerAttempt(id: string, dto: VerifyPaymentDto, customer: AuthenticatedCustomer) {
    const attempt = await this.requireAttempt(id);
    await this.ordersService.getPaymentOrderForCustomer(attempt.orderId, customer);
    return this.verifyAttempt(attempt, dto.payload, false);
  }

  async verifyGuestAttempt(id: string, dto: VerifyPaymentDto, guestToken?: string) {
    const attempt = await this.requireAttempt(id);
    await this.ordersService.getPaymentOrderForGuest(attempt.orderId, guestToken);
    return this.verifyAttempt(attempt, dto.payload, false);
  }

  async verifyAdminAttempt(id: string, dto: VerifyPaymentDto) {
    return this.verifyAttempt(await this.requireAttempt(id), dto.payload, true);
  }

  async getAdminAttempt(id: string) {
    return this.serializeAttempt(await this.requireAttempt(id));
  }

  async processWebhook(gatewayName: PaymentGatewayName, payload: Record<string, unknown>) {
    const webhook = await this.gatewayRegistry.get(gatewayName).handleWebhook(payload);
    const attempt = await this.prisma.paymentAttempt.findUnique({
      where: {
        gateway_gatewayReference: {
          gateway: gatewayName,
          gatewayReference: webhook.gatewayReference,
        },
      },
      include: attemptInclude,
    });
    if (!attempt) {
      throw new NotFoundException({
        code: 'PAYMENT_ATTEMPT_NOT_FOUND',
        message: 'No payment attempt matches the gateway reference.',
      });
    }
    this.assertGatewayAmount(attempt, webhook.amount, webhook.currency);
    return this.processCallback(attempt, webhook.eventId, payload, webhook.result);
  }

  async createRefund(
    attemptId: string,
    dto: CreateRefundDto,
    idempotencyKey: string | undefined,
    staff: AuthenticatedStaff,
  ) {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const existing = await this.prisma.paymentRefund.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      if (existing.paymentAttemptId !== attemptId || !existing.amount.equals(dto.amount)) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'The idempotency key was already used for a different refund.',
        });
      }
      return this.serializeRefund(existing);
    }

    const attempt = await this.requireAttempt(attemptId);
    await this.ordersService.getPaymentOrderForAdmin(attempt.orderId);
    if (
      attempt.status !== PaymentAttemptStatus.SUCCEEDED &&
      attempt.status !== PaymentAttemptStatus.AUTHORIZED
    ) {
      throw new ConflictException({
        code: 'PAYMENT_NOT_REFUNDABLE',
        message: 'Only successful or authorized payments can be refunded.',
      });
    }
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException({
        code: 'INVALID_REFUND_AMOUNT',
        message: 'The refund amount must be greater than zero.',
      });
    }
    const refund = await this.createPendingRefund(attempt, dto, key, staff, amount);

    let gatewayResult: GatewayRefundResult;
    try {
      gatewayResult = await this.gatewayRegistry
        .get(attempt.gateway as PaymentGatewayName)
        .refundPayment({
          gatewayReference: attempt.gatewayReference!,
          amount: amount.toFixed(2),
          currency: attempt.currency,
          idempotencyKey: key,
          reason: dto.reason,
        });
    } catch (error) {
      await this.failRefund(refund.id, 'GATEWAY_REFUND_ERROR', this.errorMessage(error));
      throw new BadGatewayException({
        code: 'GATEWAY_REFUND_ERROR',
        message: 'The payment gateway could not process the refund.',
      });
    }
    return this.applyRefundResult(refund.id, attempt, gatewayResult);
  }

  private async startPayment(
    order: PaymentOrderView,
    dto: StartPaymentDto,
    idempotencyKey: string,
  ) {
    await this.assertPaymentMethodEnabled(dto.gateway);

    const existing = await this.prisma.paymentAttempt.findUnique({
      where: { idempotencyKey },
      include: attemptInclude,
    });
    if (existing) {
      if (existing.orderId !== order.id || existing.gateway !== `${dto.gateway}`) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'The idempotency key was already used for a different payment.',
        });
      }
      return this.serializeAttempt(existing);
    }
    const hasFinalPaymentState =
      order.paymentStatus === OrderPaymentStatus.AUTHORIZED ||
      order.paymentStatus === OrderPaymentStatus.PAID ||
      order.paymentStatus === OrderPaymentStatus.PARTIALLY_REFUNDED ||
      order.paymentStatus === OrderPaymentStatus.REFUNDED;
    if (order.status === OrderStatus.CANCELLED || hasFinalPaymentState) {
      throw new ConflictException({
        code: 'ORDER_NOT_PAYABLE',
        message: 'This order cannot accept a new payment.',
      });
    }

    let attempt;
    try {
      attempt = await this.prisma.paymentAttempt.create({
        data: {
          orderId: order.id,
          gateway: dto.gateway,
          idempotencyKey,
          amount: new Prisma.Decimal(order.amount),
          currency: order.currency,
        },
        include: attemptInclude,
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const concurrent = await this.prisma.paymentAttempt.findUnique({
          where: { idempotencyKey },
          include: attemptInclude,
        });
        if (concurrent) return this.serializeAttempt(concurrent);
      }
      throw error;
    }
    this.eventPublisher.publish({
      name: 'PaymentStarted',
      occurredAt: new Date(),
      paymentAttemptId: attempt.id,
      orderId: attempt.orderId,
      gateway: attempt.gateway,
      amount: attempt.amount.toFixed(2),
      currency: attempt.currency,
    });

    let result: GatewayPaymentResult;
    try {
      result = await this.gatewayRegistry.get(dto.gateway).createPayment({
        paymentAttemptId: attempt.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: order.amount,
        currency: order.currency,
        callbackUrl: dto.callbackUrl,
        customer: order.customer,
      });
    } catch (error) {
      await this.applyGatewayResult(attempt, {
        state: 'FAILED',
        gatewayReference: `unavailable:${attempt.id}`,
        failureCode: 'GATEWAY_CREATE_ERROR',
        failureMessage: this.errorMessage(error),
      });
      throw new BadGatewayException({
        code: 'GATEWAY_CREATE_ERROR',
        message: 'The payment gateway could not start the payment.',
      });
    }
    return this.applyGatewayResult(attempt, result);
  }

  private async verifyAttempt(
    attempt: AttemptRecord,
    payload: Record<string, unknown>,
    trusted: boolean,
  ) {
    if (!attempt.gatewayReference) {
      throw new ConflictException({
        code: 'PAYMENT_GATEWAY_REFERENCE_MISSING',
        message: 'The payment attempt has no gateway reference.',
      });
    }
    const result = await this.gatewayRegistry
      .get(attempt.gateway as PaymentGatewayName)
      .verifyPayment({
        gatewayReference: attempt.gatewayReference,
        amount: attempt.amount.toFixed(2),
        currency: attempt.currency,
        payload,
        trusted,
      });
    const eventId =
      result.eventId ??
      `verify:${attempt.gatewayReference}:${result.transactionReference ?? result.state}`;
    return this.processCallback(attempt, eventId, payload, result);
  }

  private async processCallback(
    attempt: AttemptRecord,
    eventId: string,
    payload: Record<string, unknown>,
    result: GatewayPaymentResult,
  ) {
    const claimed = await this.claimCallback(
      attempt.gateway,
      eventId,
      result.gatewayReference,
      payload,
    );
    if (!claimed.process) {
      return { ...this.serializeAttempt(await this.requireAttempt(attempt.id)), duplicate: true };
    }
    try {
      const processed = await this.applyGatewayResult(attempt, result);
      await this.prisma.paymentCallback.update({
        where: { id: claimed.id },
        data: { status: PaymentCallbackStatus.PROCESSED, processedAt: new Date() },
      });
      return processed;
    } catch (error) {
      await this.prisma.paymentCallback.update({
        where: { id: claimed.id },
        data: {
          status: PaymentCallbackStatus.FAILED,
          errorCode: 'PAYMENT_CALLBACK_PROCESSING_FAILED',
          errorMessage: this.errorMessage(error),
        },
      });
      throw error;
    }
  }

  private async claimCallback(
    gateway: string,
    externalEventId: string,
    gatewayReference: string,
    payload: Record<string, unknown>,
  ): Promise<{ id: string; process: boolean }> {
    const existing = await this.prisma.paymentCallback.findUnique({
      where: { gateway_externalEventId: { gateway, externalEventId } },
    });
    if (existing) {
      if (existing.status !== PaymentCallbackStatus.FAILED) {
        return { id: existing.id, process: false };
      }
      const retry = await this.prisma.paymentCallback.update({
        where: { id: existing.id },
        data: {
          status: PaymentCallbackStatus.PROCESSING,
          errorCode: null,
          errorMessage: null,
        },
      });
      return { id: retry.id, process: true };
    }
    try {
      const created = await this.prisma.paymentCallback.create({
        data: {
          gateway,
          externalEventId,
          gatewayReference,
          payload: payload as Prisma.InputJsonObject,
        },
      });
      return { id: created.id, process: true };
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const concurrent = await this.prisma.paymentCallback.findUniqueOrThrow({
          where: { gateway_externalEventId: { gateway, externalEventId } },
        });
        return { id: concurrent.id, process: false };
      }
      throw error;
    }
  }

  private async applyGatewayResult(attemptInput: AttemptRecord, result: GatewayPaymentResult) {
    const attempt = await this.requireAttempt(attemptInput.id);
    if (attempt.gatewayReference && attempt.gatewayReference !== result.gatewayReference) {
      throw new ConflictException({
        code: 'PAYMENT_GATEWAY_REFERENCE_MISMATCH',
        message: 'The gateway reference does not match the payment attempt.',
      });
    }
    const baseData = {
      gatewayReference: result.gatewayReference,
      redirectUrl: result.redirectUrl,
      metadata: result.metadata,
      failureCode: result.failureCode,
      failureMessage: result.failureMessage,
    };
    if (result.state === 'PENDING') {
      return this.serializeAttempt(
        await this.prisma.paymentAttempt.update({
          where: { id: attempt.id },
          data: { ...baseData, status: PaymentAttemptStatus.PENDING },
          include: attemptInclude,
        }),
      );
    }
    if (result.state === 'AUTHORIZED') {
      const updated = await this.prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          ...baseData,
          status: PaymentAttemptStatus.AUTHORIZED,
          completedAt: new Date(),
        },
        include: attemptInclude,
      });
      await this.recordTransaction(updated, result, PaymentTransactionKind.AUTHORIZATION);
      await this.ordersService.markPaymentAuthorized(updated.orderId);
      return this.serializeAttempt(await this.requireAttempt(updated.id));
    }
    if (result.state === 'SUCCEEDED') {
      const updated = await this.prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          ...baseData,
          status: PaymentAttemptStatus.SUCCEEDED,
          completedAt: new Date(),
        },
        include: attemptInclude,
      });
      const recorded = await this.recordTransaction(updated, result, PaymentTransactionKind.CHARGE);
      await this.ordersService.markPaymentSucceeded(updated.orderId);
      if (recorded) {
        this.eventPublisher.publish({
          name: 'PaymentSucceeded',
          occurredAt: new Date(),
          paymentAttemptId: updated.id,
          orderId: updated.orderId,
          gateway: updated.gateway,
          transactionReference: result.transactionReference ?? null,
          amount: updated.amount.toFixed(2),
          currency: updated.currency,
        });
      }
      return this.serializeAttempt(await this.requireAttempt(updated.id));
    }

    const updated = await this.prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        ...baseData,
        status: PaymentAttemptStatus.FAILED,
        completedAt: new Date(),
      },
      include: attemptInclude,
    });
    const recorded = await this.recordTransaction(updated, result, PaymentTransactionKind.CHARGE);
    await this.ordersService.markPaymentFailed(updated.orderId);
    if (recorded) {
      this.eventPublisher.publish({
        name: 'PaymentFailed',
        occurredAt: new Date(),
        paymentAttemptId: updated.id,
        orderId: updated.orderId,
        gateway: updated.gateway,
        failureCode: result.failureCode ?? null,
      });
    }
    return this.serializeAttempt(await this.requireAttempt(updated.id));
  }

  private async recordTransaction(
    attempt: AttemptRecord,
    result: GatewayPaymentResult,
    kind: PaymentTransactionKind,
  ): Promise<boolean> {
    const reference = result.transactionReference ?? result.eventId ?? result.gatewayReference;
    const idempotencyKey = `${kind}:${attempt.gateway}:${reference}:${result.state}`;
    try {
      await this.prisma.paymentTransaction.create({
        data: {
          paymentAttemptId: attempt.id,
          kind,
          status:
            result.state === 'FAILED'
              ? PaymentTransactionStatus.FAILED
              : PaymentTransactionStatus.SUCCEEDED,
          amount: attempt.amount,
          currency: attempt.currency,
          idempotencyKey,
          gatewayReference: result.gatewayReference,
          gatewayTransactionReference: result.transactionReference,
          metadata: result.metadata,
        },
      });
      return true;
    } catch (error) {
      if (this.isUniqueConflict(error)) return false;
      throw error;
    }
  }

  private async applyRefundResult(
    refundId: string,
    attempt: AttemptRecord,
    result: GatewayRefundResult,
  ) {
    if (result.state === 'FAILED') {
      return this.serializeRefund(
        await this.failRefund(
          refundId,
          result.failureCode ?? 'REFUND_FAILED',
          result.failureMessage ?? 'The gateway rejected the refund.',
        ),
      );
    }
    const status =
      result.state === 'SUCCEEDED' ? PaymentRefundStatus.SUCCEEDED : PaymentRefundStatus.PENDING;
    const refund = await this.prisma.paymentRefund.update({
      where: { id: refundId },
      data: {
        status,
        gatewayRefundReference: result.gatewayRefundReference,
        metadata: result.metadata,
        completedAt: status === PaymentRefundStatus.SUCCEEDED ? new Date() : undefined,
      },
    });
    if (status === PaymentRefundStatus.SUCCEEDED) {
      await this.recordRefundTransaction(attempt, refund);
      const aggregate = await this.prisma.paymentRefund.aggregate({
        where: { orderId: attempt.orderId, status: PaymentRefundStatus.SUCCEEDED },
        _sum: { amount: true },
      });
      await this.ordersService.markRefunded(
        attempt.orderId,
        (aggregate._sum.amount ?? refund.amount).toFixed(2),
      );
      this.eventPublisher.publish({
        name: 'RefundCompleted',
        occurredAt: new Date(),
        refundId: refund.id,
        paymentAttemptId: attempt.id,
        orderId: attempt.orderId,
        amount: refund.amount.toFixed(2),
        currency: refund.currency,
      });
    }
    return this.serializeRefund(refund);
  }

  private async createPendingRefund(
    attempt: AttemptRecord,
    dto: CreateRefundDto,
    idempotencyKey: string,
    staff: AuthenticatedStaff,
    amount: Prisma.Decimal,
  ) {
    for (let attemptNumber = 1; attemptNumber <= 3; attemptNumber += 1) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            const aggregate = await transaction.paymentRefund.aggregate({
              where: {
                paymentAttemptId: attempt.id,
                status: { in: [PaymentRefundStatus.PENDING, PaymentRefundStatus.SUCCEEDED] },
              },
              _sum: { amount: true },
            });
            const alreadyCommitted = aggregate._sum.amount ?? new Prisma.Decimal(0);
            if (alreadyCommitted.plus(amount).greaterThan(attempt.amount)) {
              throw new ConflictException({
                code: 'REFUND_AMOUNT_EXCEEDS_PAYMENT',
                message: 'The refund amount exceeds the remaining refundable payment amount.',
                details: {
                  paymentAmount: attempt.amount.toFixed(2),
                  alreadyRefundedOrPending: alreadyCommitted.toFixed(2),
                },
              });
            }
            return transaction.paymentRefund.create({
              data: {
                paymentAttemptId: attempt.id,
                orderId: attempt.orderId,
                requestedByStaffUserId: staff.id,
                idempotencyKey,
                amount,
                currency: attempt.currency,
                reason: dto.reason,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (this.isUniqueConflict(error)) {
          const concurrent = await this.prisma.paymentRefund.findUnique({
            where: { idempotencyKey },
          });
          if (concurrent) return concurrent;
        }
        if (this.isRetryableTransactionConflict(error) && attemptNumber < 3) continue;
        throw error;
      }
    }
    throw new ConflictException({
      code: 'REFUND_WRITE_CONFLICT',
      message: 'The refund could not be created because of concurrent updates.',
    });
  }

  private async recordRefundTransaction(
    attempt: AttemptRecord,
    refund: Awaited<ReturnType<PrismaService['paymentRefund']['update']>>,
  ): Promise<void> {
    try {
      await this.prisma.paymentTransaction.create({
        data: {
          paymentAttemptId: attempt.id,
          kind: PaymentTransactionKind.REFUND,
          status: PaymentTransactionStatus.SUCCEEDED,
          amount: refund.amount,
          currency: refund.currency,
          idempotencyKey: `REFUND:${refund.id}`,
          gatewayReference: attempt.gatewayReference,
          gatewayTransactionReference: refund.gatewayRefundReference,
          metadata: refund.metadata ?? undefined,
        },
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
    }
  }

  private failRefund(id: string, code: string, message: string) {
    return this.prisma.paymentRefund.update({
      where: { id },
      data: {
        status: PaymentRefundStatus.FAILED,
        failureCode: code,
        failureMessage: message,
        completedAt: new Date(),
      },
    });
  }

  private async requireAttempt(id: string): Promise<AttemptRecord> {
    const attempt = await this.prisma.paymentAttempt.findUnique({
      where: { id },
      include: attemptInclude,
    });
    if (!attempt) {
      throw new NotFoundException({
        code: 'PAYMENT_ATTEMPT_NOT_FOUND',
        message: 'Payment attempt was not found.',
      });
    }
    return attempt;
  }

  private requireIdempotencyKey(value?: string): string {
    const key = value?.trim();
    if (!key || key.length < 8 || key.length > 200) {
      throw new BadRequestException({
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'An Idempotency-Key header between 8 and 200 characters is required.',
      });
    }
    return key;
  }

  private assertGatewayAmount(attempt: AttemptRecord, amount: string, currency: string): void {
    if (!attempt.amount.equals(amount) || attempt.currency !== currency) {
      throw new ConflictException({
        code: 'PAYMENT_WEBHOOK_AMOUNT_MISMATCH',
        message: 'The webhook amount or currency does not match the payment attempt.',
      });
    }
  }

  private serializeAttempt(attempt: AttemptRecord) {
    return {
      id: attempt.id,
      orderId: attempt.orderId,
      gateway: attempt.gateway,
      status: attempt.status,
      amount: attempt.amount.toFixed(2),
      currency: attempt.currency,
      gatewayReference: attempt.gatewayReference,
      redirectUrl: attempt.redirectUrl,
      failure: attempt.failureCode
        ? { code: attempt.failureCode, message: attempt.failureMessage }
        : null,
      metadata: attempt.metadata,
      transactions: attempt.transactions.map((transaction) => ({
        id: transaction.id,
        kind: transaction.kind,
        status: transaction.status,
        amount: transaction.amount.toFixed(2),
        currency: transaction.currency,
        gatewayTransactionReference: transaction.gatewayTransactionReference,
        occurredAt: transaction.occurredAt,
      })),
      refunds: attempt.refunds.map((refund) => this.serializeRefund(refund)),
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt,
    };
  }

  private serializeRefund<
    T extends {
      id: string;
      paymentAttemptId: string;
      orderId: string;
      status: PaymentRefundStatus;
      amount: Prisma.Decimal;
      currency: string;
      reason: string | null;
      gatewayRefundReference: string | null;
      failureCode: string | null;
      failureMessage: string | null;
      completedAt: Date | null;
      createdAt: Date;
    },
  >(refund: T) {
    return {
      id: refund.id,
      paymentAttemptId: refund.paymentAttemptId,
      orderId: refund.orderId,
      status: refund.status,
      amount: refund.amount.toFixed(2),
      currency: refund.currency,
      reason: refund.reason,
      gatewayRefundReference: refund.gatewayRefundReference,
      failure: refund.failureCode
        ? { code: refund.failureCode, message: refund.failureMessage }
        : null,
      completedAt: refund.completedAt,
      createdAt: refund.createdAt,
    };
  }

  private isUniqueConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private isRetryableTransactionConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown gateway error.';
  }

  private async assertPaymentMethodEnabled(gateway: PaymentGatewayName) {
    const settings = await this.settingsService.get();
    const isCod = gateway === PaymentGatewayName.CASH_ON_DELIVERY;
    if (isCod && !settings.codPaymentEnabled) {
      throw new BadRequestException({
        code: 'PAYMENT_METHOD_DISABLED',
        message: 'Cash on delivery is disabled for this shop.',
        details: { gateway },
      });
    }
    if (!isCod && !settings.onlinePaymentEnabled) {
      throw new BadRequestException({
        code: 'PAYMENT_METHOD_DISABLED',
        message: 'Online payment is disabled for this shop.',
        details: { gateway },
      });
    }
  }
}
