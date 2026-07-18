import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PaymentAttemptStatus, ProductStatus, StaffRole } from '@prisma/client';
import request from 'supertest';

import { BackgroundJobQueue } from '../src/infrastructure/background/background-job-queue.service';
import { BackgroundJobName } from '../src/infrastructure/background/background-job.types';
import { StaffAuthGuard } from '../src/modules/auth/guards/staff-auth.guard';
import { CartService } from '../src/modules/cart/services/cart.service';
import { CatalogService } from '../src/modules/catalog/services/catalog.service';
import { CustomerAuthGuard } from '../src/modules/customers/guards/customer-auth.guard';
import { NotificationDeliveryService } from '../src/modules/notifications/services/notification-delivery.service';
import { OrdersService } from '../src/modules/orders/services/orders.service';
import { PaymentGatewayName } from '../src/modules/payments/contracts/payment-gateway';
import { PaymentEventPublisher } from '../src/modules/payments/services/payment-event-publisher.service';
import { PaymentsService } from '../src/modules/payments/services/payments.service';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';
import { ResponseEnvelopeInterceptor } from '../src/shared/response/response-envelope.interceptor';

describe('Protected core order flow', () => {
  const productId = '11111111-1111-4111-8111-111111111111';
  const variantId = '22222222-2222-4222-8222-222222222222';
  const cartId = '33333333-3333-4333-8333-333333333333';
  const orderId = '44444444-4444-4444-8444-444444444444';
  const attemptId = '55555555-5555-4555-8555-555555555555';
  const customer = {
    id: '66666666-6666-4666-8666-666666666666',
    email: 'customer@example.test',
    phone: null,
    name: 'Customer',
    sessionId: 'customer-session-id',
  };
  const address = {
    fullName: 'Test Customer',
    phone: '+12025550123',
    country: 'US',
    province: 'CA',
    city: 'Los Angeles',
    line1: '1 Test Street',
  };
  const state = {
    productAdded: false,
    cartCreated: false,
    itemAdded: false,
    discountApplied: false,
    inventoryReserved: false,
    orderCreated: false,
    paymentStarted: false,
    paymentVerified: false,
    inventoryConfirmed: false,
  };
  let app: INestApplication;
  let paymentEvents: PaymentEventPublisher;

  const catalog = {
    createProduct: jest.fn((dto: { name: string; slug: string }) => {
      state.productAdded = true;
      return { id: productId, ...dto, status: ProductStatus.ACTIVE };
    }),
  };
  const cart = {
    createCustomerCart: jest.fn(() => {
      expect(state.productAdded).toBe(true);
      state.cartCreated = true;
      return { id: cartId, customerId: customer.id, items: [], totals: { grandTotal: '0.00' } };
    }),
    addCustomerItem: jest.fn((_id: string, dto: { variantId: string; quantity: number }) => {
      expect(state.cartCreated).toBe(true);
      state.itemAdded = true;
      return {
        id: cartId,
        items: [dto],
        totals: { subtotal: '50.00', discountTotal: '0.00', grandTotal: '50.00' },
      };
    }),
    applyCustomerDiscount: jest.fn(() => {
      expect(state.itemAdded).toBe(true);
      state.discountApplied = true;
      return {
        id: cartId,
        discountCode: 'SAVE10',
        items: [{ variantId, quantity: 2 }],
        totals: { subtotal: '50.00', discountTotal: '10.00', grandTotal: '40.00' },
      };
    }),
  };
  const orders = {
    checkoutCustomer: jest.fn(() => {
      expect(state.discountApplied).toBe(true);
      state.inventoryReserved = true;
      state.orderCreated = true;
      return {
        id: orderId,
        orderNumber: 'ORD-CORE-FLOW',
        status: 'PENDING',
        paymentStatus: 'PENDING',
        items: [{ variantId, quantity: 2, inventoryReservationId: 'reservation-id' }],
        totals: { grandTotal: '40.00' },
      };
    }),
    getNotificationOrder: jest.fn(() => ({
      id: orderId,
      orderNumber: 'ORD-CORE-FLOW',
      customerId: customer.id,
      customer: { name: customer.name, email: customer.email },
      total: '40.00',
      currency: 'USD',
    })),
  };
  const payments = {
    startCustomerPayment: jest.fn(() => {
      expect(state.orderCreated).toBe(true);
      state.paymentStarted = true;
      return {
        id: attemptId,
        orderId,
        gateway: PaymentGatewayName.DEVELOPMENT,
        status: PaymentAttemptStatus.PENDING,
      };
    }),
    verifyCustomerAttempt: jest.fn(() => {
      expect(state.paymentStarted).toBe(true);
      state.paymentVerified = true;
      state.inventoryConfirmed = true;
      paymentEvents.publish({
        name: 'PaymentSucceeded',
        occurredAt: new Date(),
        paymentAttemptId: attemptId,
        orderId,
        gateway: PaymentGatewayName.DEVELOPMENT,
        transactionReference: 'transaction-id',
        amount: '40.00',
        currency: 'USD',
      });
      return { id: attemptId, status: PaymentAttemptStatus.SUCCEEDED };
    }),
  };
  const backgroundJobs = { add: jest.fn(() => Promise.resolve({ id: 'job-id' })) };
  const notifications = { sendAdmin: jest.fn(() => Promise.resolve({ id: 'notification-id' })) };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ecommerce_test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-with-enough-length';

    const { AppModule } = await import('../src/app/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CatalogService)
      .useValue(catalog)
      .overrideProvider(CartService)
      .useValue(cart)
      .overrideProvider(OrdersService)
      .useValue(orders)
      .overrideProvider(PaymentsService)
      .useValue(payments)
      .overrideProvider(BackgroundJobQueue)
      .useValue(backgroundJobs)
      .overrideProvider(NotificationDeliveryService)
      .useValue(notifications)
      .overrideGuard(StaffAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { staff?: Record<string, unknown> } };
        }) => {
          context.switchToHttp().getRequest().staff = {
            id: 'staff-id',
            email: 'manager@example.test',
            name: 'Product Manager',
            role: StaffRole.PRODUCT_MANAGER,
            sessionId: 'staff-session-id',
          };
          return true;
        },
      })
      .overrideGuard(CustomerAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { customer?: typeof customer } };
        }) => {
          context.switchToHttp().getRequest().customer = customer;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    const config = app.get(ConfigService);
    app.setGlobalPrefix(config.getOrThrow<string>('app.apiPrefix'));
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: config.getOrThrow<string>('app.apiVersion'),
    });
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    await app.init();
    paymentEvents = app.get(PaymentEventPublisher);
  });

  afterAll(async () => app.close());

  it('protects the complete checkout, payment, inventory, and notification journey', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/admin/products')
      .set('Authorization', 'Bearer staff')
      .send({ name: 'Core Flow Product', slug: 'core-flow-product', status: ProductStatus.ACTIVE })
      .expect(201);
    await request(server)
      .post('/api/v1/store/cart')
      .set('Authorization', 'Bearer customer')
      .send({ currency: 'USD' })
      .expect(201);
    await request(server)
      .post(`/api/v1/store/cart/${cartId}/items`)
      .set('Authorization', 'Bearer customer')
      .send({ variantId, quantity: 2 })
      .expect(201);
    await request(server)
      .put(`/api/v1/store/cart/${cartId}/discount`)
      .set('Authorization', 'Bearer customer')
      .send({ code: 'SAVE10' })
      .expect(200);
    await request(server)
      .post('/api/v1/store/checkout')
      .set('Authorization', 'Bearer customer')
      .send({ cartId, billingAddress: address, shippingAddress: address })
      .expect(201);
    await request(server)
      .post(`/api/v1/store/payments/orders/${orderId}/attempts`)
      .set('Authorization', 'Bearer customer')
      .set('Idempotency-Key', 'core-flow-payment')
      .send({ gateway: PaymentGatewayName.DEVELOPMENT })
      .expect(201);
    await request(server)
      .post(`/api/v1/store/payments/attempts/${attemptId}/verification`)
      .set('Authorization', 'Bearer customer')
      .send({ payload: { signed: true } })
      .expect(201);
    await thisTurn();

    expect(state).toEqual({
      productAdded: true,
      cartCreated: true,
      itemAdded: true,
      discountApplied: true,
      inventoryReserved: true,
      orderCreated: true,
      paymentStarted: true,
      paymentVerified: true,
      inventoryConfirmed: true,
    });
    expect(backgroundJobs.add).toHaveBeenCalledWith(
      BackgroundJobName.EMAIL_DELIVERY,
      expect.objectContaining({ eventName: 'PaymentSucceeded', eventId: attemptId }),
    );
    expect(notifications.sendAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'PaymentSucceeded', eventId: attemptId }),
    );
  });
});

async function thisTurn(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
