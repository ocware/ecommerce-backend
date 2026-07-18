import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PaymentAttemptStatus, PaymentRefundStatus, StaffRole } from '@prisma/client';
import request from 'supertest';

import { StaffAuthGuard } from '../src/modules/auth/guards/staff-auth.guard';
import { CustomerAuthGuard } from '../src/modules/customers/guards/customer-auth.guard';
import { PaymentGatewayName } from '../src/modules/payments/contracts/payment-gateway';
import { PaymentsService } from '../src/modules/payments/services/payments.service';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';
import { ResponseEnvelopeInterceptor } from '../src/shared/response/response-envelope.interceptor';

type ApiResponseBody = {
  data: {
    id?: string;
    status?: PaymentAttemptStatus | PaymentRefundStatus;
    duplicate?: boolean;
  };
};

describe('Payments API', () => {
  const orderId = '11111111-1111-4111-8111-111111111111';
  const attemptId = '22222222-2222-4222-8222-222222222222';
  let app: INestApplication;
  const paymentsService = {
    startCustomerPayment: jest.fn(),
    startGuestPayment: jest.fn(),
    getCustomerAttempt: jest.fn(),
    getGuestAttempt: jest.fn(),
    verifyCustomerAttempt: jest.fn(),
    verifyGuestAttempt: jest.fn(),
    verifyAdminAttempt: jest.fn(),
    getAdminAttempt: jest.fn(),
    processWebhook: jest.fn(),
    createRefund: jest.fn(),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ecommerce_test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-with-enough-length';
    process.env.PAYMENT_WEBHOOK_SECRET = 'test-payment-secret-with-length';

    const { AppModule } = await import('../src/app/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PaymentsService)
      .useValue(paymentsService)
      .overrideGuard(CustomerAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { customer?: Record<string, unknown> } };
        }) => {
          context.switchToHttp().getRequest().customer = {
            id: 'customer-id',
            email: 'customer@example.test',
            name: 'Customer',
            sessionId: 'customer-session-id',
          };
          return true;
        },
      })
      .overrideGuard(StaffAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { staff?: Record<string, unknown> } };
        }) => {
          context.switchToHttp().getRequest().staff = {
            id: 'order-manager-id',
            email: 'orders@example.test',
            name: 'Order Manager',
            role: StaffRole.ORDER_MANAGER,
            sessionId: 'staff-session-id',
          };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    const configService = app.get(ConfigService);
    app.setGlobalPrefix(configService.getOrThrow<string>('app.apiPrefix'));
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: configService.getOrThrow<string>('app.apiVersion'),
    });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    await app.init();
  });

  afterEach(() => jest.clearAllMocks());
  afterAll(async () => app.close());

  it('starts an authenticated customer payment with an idempotency key', async () => {
    paymentsService.startCustomerPayment.mockResolvedValue({
      id: attemptId,
      orderId,
      gateway: PaymentGatewayName.DEVELOPMENT,
      status: PaymentAttemptStatus.PENDING,
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post(`/api/v1/store/payments/orders/${orderId}/attempts`)
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'checkout-payment-1')
      .send({ gateway: PaymentGatewayName.DEVELOPMENT, callbackUrl: 'http://localhost/return' })
      .expect(201)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.id).toBe(attemptId);
        expect(body.data.status).toBe(PaymentAttemptStatus.PENDING);
      });

    expect(paymentsService.startCustomerPayment).toHaveBeenCalledWith(
      orderId,
      expect.objectContaining({ gateway: PaymentGatewayName.DEVELOPMENT }),
      'checkout-payment-1',
      expect.objectContaining({ id: 'customer-id' }),
    );
  });

  it('rejects unknown gateway names before reaching the service', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post(`/api/v1/store/payments/orders/${orderId}/attempts`)
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'checkout-payment-2')
      .send({ gateway: 'UNTRUSTED_GATEWAY' })
      .expect(400);

    expect(paymentsService.startCustomerPayment).not.toHaveBeenCalled();
  });

  it('accepts gateway webhooks through a gateway-specific public endpoint', async () => {
    paymentsService.processWebhook.mockResolvedValue({
      id: attemptId,
      status: PaymentAttemptStatus.SUCCEEDED,
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post(`/api/v1/payments/webhooks/${PaymentGatewayName.DEVELOPMENT}`)
      .send({ eventId: 'gateway-event', signature: 'signed-payload' })
      .expect(201);

    expect(paymentsService.processWebhook).toHaveBeenCalledWith(
      PaymentGatewayName.DEVELOPMENT,
      expect.objectContaining({ eventId: 'gateway-event' }),
    );
  });

  it('allows order managers to create partial refunds idempotently', async () => {
    paymentsService.createRefund.mockResolvedValue({
      id: 'refund-id',
      paymentAttemptId: attemptId,
      status: PaymentRefundStatus.SUCCEEDED,
      amount: '25.00',
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post(`/api/v1/admin/payments/attempts/${attemptId}/refunds`)
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'refund-payment-1')
      .send({ amount: '25.00', reason: 'Partial return' })
      .expect(201)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.status).toBe(PaymentRefundStatus.SUCCEEDED);
      });
  });
});
