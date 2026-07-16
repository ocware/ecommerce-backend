import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DiscountMode, DiscountType, StaffRole } from '@prisma/client';
import request from 'supertest';

import { StaffAuthGuard } from '../src/modules/auth/guards/staff-auth.guard';
import { DiscountsService } from '../src/modules/discounts/services/discounts.service';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';
import { ResponseEnvelopeInterceptor } from '../src/shared/response/response-envelope.interceptor';

type ApiResponseBody = {
  data: {
    id?: string;
    code?: string;
    type?: DiscountType;
  };
  errors: Array<{ code: string }>;
};

describe('Discounts API', () => {
  const discountId = '11111111-1111-4111-8111-111111111111';
  let app: INestApplication;
  let staffRole: StaffRole = StaffRole.PRODUCT_MANAGER;
  const discountsService = {
    createDiscount: jest.fn(),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ecommerce_test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-with-enough-length';

    const { AppModule } = await import('../src/app/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DiscountsService)
      .useValue(discountsService)
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
            id: 'product-manager-id',
            email: 'products@example.com',
            name: 'Product Manager',
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
    staffRole = StaffRole.PRODUCT_MANAGER;
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows product managers to create percentage coupons', async () => {
    discountsService.createDiscount.mockResolvedValue({
      id: discountId,
      name: 'Welcome discount',
      code: 'WELCOME10',
      mode: DiscountMode.COUPON,
      type: DiscountType.PERCENTAGE,
      value: '10.00',
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/admin/discounts')
      .set('Authorization', 'Bearer token')
      .send({
        name: 'Welcome discount',
        code: 'WELCOME10',
        mode: DiscountMode.COUPON,
        type: DiscountType.PERCENTAGE,
        value: '10.00',
      })
      .expect(201)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.id).toBe(discountId);
        expect(body.data.code).toBe('WELCOME10');
      });
  });

  it('rejects malformed coupon codes before calling the service', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/admin/discounts')
      .set('Authorization', 'Bearer token')
      .send({
        name: 'Welcome discount',
        code: 'NOT VALID',
        mode: DiscountMode.COUPON,
        type: DiscountType.PERCENTAGE,
        value: '10.00',
      })
      .expect(400);

    expect(discountsService.createDiscount).not.toHaveBeenCalled();
  });

  it('blocks staff without discount permission', async () => {
    staffRole = StaffRole.SUPPORT;
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/admin/discounts')
      .set('Authorization', 'Bearer token')
      .send({
        name: 'Welcome discount',
        code: 'WELCOME10',
        mode: DiscountMode.COUPON,
        type: DiscountType.PERCENTAGE,
        value: '10.00',
      })
      .expect(403)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.errors[0].code).toBe('INSUFFICIENT_PERMISSION');
      });
  });
});
