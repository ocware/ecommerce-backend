import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OrderStatus, StaffRole } from '@prisma/client';
import request from 'supertest';

import { StaffAuthGuard } from '../src/modules/auth/guards/staff-auth.guard';
import { CustomerAuthGuard } from '../src/modules/customers/guards/customer-auth.guard';
import { OrdersService } from '../src/modules/orders/services/orders.service';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';
import { ResponseEnvelopeInterceptor } from '../src/shared/response/response-envelope.interceptor';

type ApiResponseBody = {
  data: {
    id?: string;
    orderNumber?: string;
    status?: OrderStatus;
    items?: unknown[];
  };
};

describe('Orders API', () => {
  const cartId = '11111111-1111-4111-8111-111111111111';
  const orderId = '22222222-2222-4222-8222-222222222222';
  let app: INestApplication;
  const ordersService = {
    checkoutCustomer: jest.fn(),
    checkoutGuest: jest.fn(),
    listCustomerOrders: jest.fn(),
    getCustomerOrder: jest.fn(),
    cancelCustomerOrder: jest.fn(),
    listAdminOrders: jest.fn(),
    getAdminOrder: jest.fn(),
    cancelAdminOrder: jest.fn(),
    listInternalNotes: jest.fn(),
    addInternalNote: jest.fn(),
  };
  const address = {
    fullName: 'Test Customer',
    phone: '+12025550123',
    country: 'US',
    province: 'CA',
    city: 'Los Angeles',
    line1: '1 Test Street',
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ecommerce_test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-with-enough-length';

    const { AppModule } = await import('../src/app/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OrdersService)
      .useValue(ordersService)
      .overrideGuard(CustomerAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => {
            getRequest: () => { customer?: Record<string, unknown> };
          };
        }) => {
          context.switchToHttp().getRequest().customer = {
            id: 'customer-id',
            email: 'customer@example.test',
            phone: null,
            name: 'Customer',
            sessionId: 'customer-session-id',
          };
          return true;
        },
      })
      .overrideGuard(StaffAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => {
            getRequest: () => { staff?: Record<string, unknown> };
          };
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

  it('checks out an authenticated customer cart', async () => {
    ordersService.checkoutCustomer.mockResolvedValue({
      id: orderId,
      orderNumber: 'ORD-20260718-1234567890',
      status: OrderStatus.PENDING,
      items: [{ sku: 'SKU-1', quantity: 1 }],
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/store/checkout')
      .set('Authorization', 'Bearer token')
      .send({ cartId, billingAddress: address, shippingAddress: address })
      .expect(201)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.id).toBe(orderId);
        expect(body.data.status).toBe(OrderStatus.PENDING);
      });

    expect(ordersService.checkoutCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ cartId }),
      expect.objectContaining({ id: 'customer-id' }),
    );
  });

  it('passes opaque cart access to guest checkout', async () => {
    ordersService.checkoutGuest.mockResolvedValue({
      id: orderId,
      orderNumber: 'ORD-20260718-1234567890',
      status: OrderStatus.PENDING,
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/store/checkout/guest')
      .set('x-cart-token', 'opaque-guest-token')
      .send({
        cartId,
        customer: { name: 'Guest', email: 'guest@example.test' },
        billingAddress: address,
        shippingAddress: address,
      })
      .expect(201);

    expect(ordersService.checkoutGuest).toHaveBeenCalledWith(
      expect.objectContaining({ cartId }),
      'opaque-guest-token',
    );
  });

  it('rejects checkout payloads without complete address snapshots', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/store/checkout')
      .set('Authorization', 'Bearer token')
      .send({ cartId, billingAddress: { fullName: 'Customer' }, shippingAddress: address })
      .expect(400);

    expect(ordersService.checkoutCustomer).not.toHaveBeenCalled();
  });

  it('allows order managers to cancel orders', async () => {
    ordersService.cancelAdminOrder.mockResolvedValue({
      id: orderId,
      orderNumber: 'ORD-20260718-1234567890',
      status: OrderStatus.CANCELLED,
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .patch(`/api/v1/admin/orders/${orderId}/cancellation`)
      .set('Authorization', 'Bearer token')
      .send({ reason: 'Customer request' })
      .expect(200)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.status).toBe(OrderStatus.CANCELLED);
      });
  });
});
