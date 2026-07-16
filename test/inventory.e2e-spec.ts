import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { InventoryReservationStatus, StaffRole } from '@prisma/client';
import request from 'supertest';

import { StaffAuthGuard } from '../src/modules/auth/guards/staff-auth.guard';
import { InventoryService } from '../src/modules/inventory/services/inventory.service';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';
import { ResponseEnvelopeInterceptor } from '../src/shared/response/response-envelope.interceptor';

type ApiResponseBody = {
  data: {
    variantId?: string;
    currentStock?: number;
    availableStock?: number;
    status?: InventoryReservationStatus;
  };
  errors: Array<{ code: string }>;
};

describe('Inventory API', () => {
  const variantId = '11111111-1111-4111-8111-111111111111';
  let app: INestApplication;
  let staffRole: StaffRole = StaffRole.WAREHOUSE_STAFF;
  const inventoryService = {
    initializeInventory: jest.fn(),
    getAvailability: jest.fn(),
    reserveStock: jest.fn(),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ecommerce_test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-with-enough-length';

    const { AppModule } = await import('../src/app/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(InventoryService)
      .useValue(inventoryService)
      .overrideGuard(StaffAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => {
            getRequest: () => {
              staff?: {
                id: string;
                email: string;
                name: string;
                role: StaffRole;
                sessionId: string;
              };
            };
          };
        }) => {
          context.switchToHttp().getRequest().staff = {
            id: 'warehouse-id',
            email: 'warehouse@example.com',
            name: 'Warehouse Staff',
            role: staffRole,
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
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    await app.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
    staffRole = StaffRole.WAREHOUSE_STAFF;
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows warehouse staff to initialize variant inventory', async () => {
    inventoryService.initializeInventory.mockResolvedValue({
      variantId,
      currentStock: 10,
      reservedStock: 0,
      availableStock: 10,
      lowStockThreshold: 2,
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/admin/inventory')
      .set('Authorization', 'Bearer token')
      .send({ variantId, currentStock: 10, lowStockThreshold: 2 })
      .expect(201)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.availableStock).toBe(10);
      });
  });

  it('blocks staff without inventory permission', async () => {
    staffRole = StaffRole.SUPPORT;
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/admin/inventory')
      .set('Authorization', 'Bearer token')
      .send({ variantId, currentStock: 10, lowStockThreshold: 2 })
      .expect(403)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.errors[0].code).toBe('INSUFFICIENT_PERMISSION');
      });
  });

  it('exposes storefront availability without administrative stock details', async () => {
    inventoryService.getAvailability.mockResolvedValue({
      variantId,
      availableStock: 3,
      inStock: true,
      lowStock: false,
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .get(`/api/v1/store/inventory/${variantId}`)
      .expect(200)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.availableStock).toBe(3);
        expect(body.data.currentStock).toBeUndefined();
      });
  });

  it('creates stock reservations through the protected operations API', async () => {
    inventoryService.reserveStock.mockResolvedValue({
      id: 'reservation-id',
      variantId,
      quantity: 2,
      status: InventoryReservationStatus.ACTIVE,
      availableStock: 8,
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/admin/inventory/reservations')
      .set('Authorization', 'Bearer token')
      .send({
        variantId,
        quantity: 2,
        externalReference: 'checkout-123',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      })
      .expect(201)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.status).toBe(InventoryReservationStatus.ACTIVE);
      });
  });
});
