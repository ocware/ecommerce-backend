import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ShipmentStatus, ShippingMethodType, StaffRole } from '@prisma/client';
import request from 'supertest';

import { StaffAuthGuard } from '../src/modules/auth/guards/staff-auth.guard';
import { CustomerAuthGuard } from '../src/modules/customers/guards/customer-auth.guard';
import { ShippingProviderName } from '../src/modules/shipping/contracts/shipping-provider';
import { ShippingRatesService } from '../src/modules/shipping/services/shipping-rates.service';
import { ShippingService } from '../src/modules/shipping/services/shipping.service';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';
import { ResponseEnvelopeInterceptor } from '../src/shared/response/response-envelope.interceptor';

type ApiResponseBody = {
  data: {
    id?: string;
    status?: ShipmentStatus;
    total?: string;
    items?: unknown[];
  };
};

describe('Shipping API', () => {
  const methodId = '11111111-1111-4111-8111-111111111111';
  const orderId = '22222222-2222-4222-8222-222222222222';
  const shipmentId = '33333333-3333-4333-8333-333333333333';
  let app: INestApplication;
  const shippingRatesService = {
    getAvailableRates: jest.fn(),
    listMethods: jest.fn(),
    createMethod: jest.fn(),
    updateMethod: jest.fn(),
    listZones: jest.fn(),
    createZone: jest.fn(),
    updateZone: jest.fn(),
    upsertRate: jest.fn(),
    quoteForCheckout: jest.fn(),
  };
  const shippingService = {
    createShipment: jest.fn(),
    listAdminShipments: jest.fn(),
    getAdminShipment: jest.fn(),
    listCustomerOrderShipments: jest.fn(),
    listGuestOrderShipments: jest.fn(),
    updateStatus: jest.fn(),
    trackShipment: jest.fn(),
    cancelShipment: jest.fn(),
  };
  const address = {
    fullName: 'Customer',
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
      .overrideProvider(ShippingRatesService)
      .useValue(shippingRatesService)
      .overrideProvider(ShippingService)
      .useValue(shippingService)
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
            id: 'admin-id',
            email: 'admin@example.test',
            name: 'Admin',
            role: StaffRole.ADMIN,
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

  it('returns address-aware storefront shipping rates', async () => {
    shippingRatesService.getAvailableRates.mockResolvedValue([
      { methodId, name: 'Standard', price: '8.00', discount: '0.00', total: '8.00' },
    ]);
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/store/shipping/rates')
      .send({ address, orderSubtotal: '50.00', currency: 'USD' })
      .expect(201)
      .expect(({ body }: { body: { data: Array<{ total: string }> } }) => {
        expect(body.data[0].total).toBe('8.00');
      });
  });

  it('allows administrators to create local pickup methods', async () => {
    shippingRatesService.createMethod.mockResolvedValue({ id: methodId, code: 'store-pickup' });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/admin/shipping/methods')
      .set('Authorization', 'Bearer token')
      .send({
        code: 'store-pickup',
        name: 'Store pickup',
        provider: ShippingProviderName.LOCAL,
        type: ShippingMethodType.LOCAL_PICKUP,
        currency: 'USD',
        defaultPrice: '0.00',
        estimatedMinDays: 0,
        estimatedMaxDays: 1,
        pickupAddress: { city: 'Los Angeles', line1: '1 Shop Street' },
      })
      .expect(201)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.id).toBe(methodId);
      });
  });

  it('creates shipments for paid orders through the admin API', async () => {
    shippingService.createShipment.mockResolvedValue({
      id: shipmentId,
      orderId,
      status: ShipmentStatus.CREATED,
      trackingCode: 'LOCAL-123',
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/admin/shipments')
      .set('Authorization', 'Bearer token')
      .send({ orderId })
      .expect(201)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.status).toBe(ShipmentStatus.CREATED);
      });
  });

  it('exposes shipment history only through authenticated customer order access', async () => {
    shippingService.listCustomerOrderShipments.mockResolvedValue([
      { id: shipmentId, orderId, status: ShipmentStatus.IN_TRANSIT },
    ]);
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .get(`/api/v1/store/shipping/orders/${orderId}/shipments`)
      .set('Authorization', 'Bearer token')
      .expect(200)
      .expect(({ body }: { body: { data: unknown[] } }) => {
        expect(body.data).toHaveLength(1);
      });
  });
});
