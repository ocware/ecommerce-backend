import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { StaffRole } from '@prisma/client';
import request from 'supertest';

import { StaffAuthGuard } from '../src/modules/auth/guards/staff-auth.guard';
import { ReportsService } from '../src/modules/reports/services/reports.service';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';
import { ResponseEnvelopeInterceptor } from '../src/shared/response/response-envelope.interceptor';

describe('Reports API', () => {
  let app: INestApplication;
  const reports = {
    getOverview: jest.fn(),
    getSalesByDate: jest.fn(),
    getBestSellingProducts: jest.fn(),
    getLowStockProducts: jest.fn(),
    getPaymentStatusSummary: jest.fn(),
    getRefundSummary: jest.fn(),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ecommerce_test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-with-enough-length';

    const { AppModule } = await import('../src/app/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ReportsService)
      .useValue(reports)
      .overrideGuard(StaffAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { staff?: Record<string, unknown> } };
        }) => {
          context.switchToHttp().getRequest().staff = {
            id: '11111111-1111-4111-8111-111111111111',
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

  it('returns the overview through the standard response envelope', async () => {
    reports.getOverview.mockResolvedValue({ orderCount: 2, grossSales: '45.00' });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .get('/api/v1/admin/reports/overview')
      .set('Authorization', 'Bearer token')
      .query({
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.999Z',
        currency: 'USD',
      })
      .expect(200)
      .expect(({ body }: { body: { data: { orderCount: number } } }) => {
        expect(body.data.orderCount).toBe(2);
      });

    expect(reports.getOverview).toHaveBeenCalledWith({
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T23:59:59.999Z',
      currency: 'USD',
    });
  });

  it('transforms pagination and ranking limits before calling the service', async () => {
    reports.getBestSellingProducts.mockResolvedValue({ products: [] });
    reports.getLowStockProducts.mockResolvedValue({ items: [] });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .get('/api/v1/admin/reports/best-selling-products?limit=5')
      .set('Authorization', 'Bearer token')
      .expect(200);
    await request(server)
      .get('/api/v1/admin/reports/low-stock-products?page=2&limit=10')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(reports.getBestSellingProducts).toHaveBeenCalledWith({ limit: 5 });
    expect(reports.getLowStockProducts).toHaveBeenCalledWith({ page: 2, limit: 10 });
  });

  it('rejects invalid filters before querying reports', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .get('/api/v1/admin/reports/payment-status?currency=usd&from=not-a-date')
      .set('Authorization', 'Bearer token')
      .expect(400);

    expect(reports.getPaymentStatusSummary).not.toHaveBeenCalled();
  });
});
