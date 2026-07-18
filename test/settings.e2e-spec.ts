import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { StaffRole } from '@prisma/client';
import request from 'supertest';

import { StaffAuthGuard } from '../src/modules/auth/guards/staff-auth.guard';
import { SettingsService } from '../src/modules/settings/services/settings.service';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';
import { ResponseEnvelopeInterceptor } from '../src/shared/response/response-envelope.interceptor';

describe('Settings API', () => {
  const staffId = '11111111-1111-4111-8111-111111111111';
  let app: INestApplication;
  const settings = {
    get: jest.fn(),
    getAdmin: jest.fn(),
    update: jest.fn(),
  };
  const storefrontSettings = {
    shopName: 'Example Store',
    currency: 'USD',
    taxEnabled: true,
    taxRate: '8.2500',
    defaultShippingMethodId: null,
    orderPrefix: 'ORD',
    lowStockThreshold: 3,
    guestCheckoutEnabled: true,
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ecommerce_test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-with-enough-length';

    const { AppModule } = await import('../src/app/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SettingsService)
      .useValue(settings)
      .overrideGuard(StaffAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { staff?: Record<string, unknown> } };
        }) => {
          context.switchToHttp().getRequest().staff = {
            id: staffId,
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

  it('exposes safe storefront behavior settings', async () => {
    settings.get.mockResolvedValue(storefrontSettings);
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .get('/api/v1/store/settings')
      .expect(200)
      .expect(({ body }: { body: { data: typeof storefrontSettings } }) => {
        expect(body.data.shopName).toBe('Example Store');
        expect(body.data.currency).toBe('USD');
      });
  });

  it('allows authorized administrators to update shop behavior', async () => {
    settings.update.mockResolvedValue({
      ...storefrontSettings,
      orderPrefix: 'SHOP',
      guestCheckoutEnabled: false,
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .patch('/api/v1/admin/settings')
      .set('Authorization', 'Bearer token')
      .send({ orderPrefix: 'SHOP', guestCheckoutEnabled: false, taxRate: 9.5 })
      .expect(200);

    expect(settings.update).toHaveBeenCalledWith(
      { orderPrefix: 'SHOP', guestCheckoutEnabled: false, taxRate: 9.5 },
      staffId,
    );
  });

  it('rejects invalid behavior settings before persistence', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .patch('/api/v1/admin/settings')
      .set('Authorization', 'Bearer token')
      .send({ currency: 'usd', orderPrefix: 'invalid prefix' })
      .expect(400);

    expect(settings.update).not.toHaveBeenCalled();
  });
});
