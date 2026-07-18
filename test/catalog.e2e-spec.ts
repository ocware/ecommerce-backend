import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ProductStatus, StaffRole } from '@prisma/client';
import request from 'supertest';

import { StaffAuthGuard } from '../src/modules/auth/guards/staff-auth.guard';
import { CatalogService } from '../src/modules/catalog/services/catalog.service';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';
import { ResponseEnvelopeInterceptor } from '../src/shared/response/response-envelope.interceptor';

type ApiResponseBody = {
  data: {
    id?: string;
    name?: string;
    items?: Array<{ slug: string }>;
  };
  errors: Array<{ code: string }>;
};

describe('Catalog API', () => {
  let app: INestApplication;
  const catalogService = {
    createProduct: jest.fn(),
    listStoreProducts: jest.fn(),
    findStoreProduct: jest.fn(),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ecommerce_test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-with-enough-length';

    const { AppModule } = await import('../src/app/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CatalogService)
      .useValue(catalogService)
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
            role: StaffRole.PRODUCT_MANAGER,
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows product managers to create products through admin APIs', async () => {
    catalogService.createProduct.mockResolvedValue({
      id: 'product-id',
      name: 'Classic T-Shirt',
      slug: 'classic-t-shirt',
      status: ProductStatus.DRAFT,
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/admin/products')
      .set('Authorization', 'Bearer token')
      .send({ name: 'Classic T-Shirt', slug: 'classic-t-shirt' })
      .expect(201)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.id).toBe('product-id');
      });
  });

  it('rejects invalid product slugs before the service is called', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/admin/products')
      .set('Authorization', 'Bearer token')
      .send({ name: 'Classic T-Shirt', slug: 'Classic T Shirt' })
      .expect(400)
      .expect(({ body }: { body: { errors: Array<{ code: string; details: unknown }> } }) => {
        expect(body.errors[0].code).toBe('VALIDATION_ERROR');
        const details = body.errors[0].details as { fields: Array<{ field: string }> };
        expect(details.fields.some((field) => field.field === 'slug')).toBe(true);
      });

    expect(catalogService.createProduct).not.toHaveBeenCalled();
  });

  it('supports transformed pagination and storefront product search', async () => {
    catalogService.listStoreProducts.mockResolvedValue({
      items: [{ slug: 'classic-t-shirt' }],
      pagination: { page: 2, limit: 10, total: 1, pageCount: 1 },
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .get('/api/v1/store/products?search=shirt&category=apparel&currency=USD&page=2&limit=10')
      .expect(200)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.items?.[0].slug).toBe('classic-t-shirt');
      });

    expect(catalogService.listStoreProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'shirt',
        category: 'apparel',
        currency: 'USD',
        page: 2,
        limit: 10,
      }),
    );
  });

  it('returns storefront product details by slug', async () => {
    catalogService.findStoreProduct.mockResolvedValue({
      id: 'product-id',
      name: 'Classic T-Shirt',
      slug: 'classic-t-shirt',
      status: ProductStatus.ACTIVE,
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .get('/api/v1/store/products/classic-t-shirt?currency=USD')
      .expect(200)
      .expect(({ body }: { body: ApiResponseBody }) => {
        expect(body.data.name).toBe('Classic T-Shirt');
      });

    expect(catalogService.findStoreProduct).toHaveBeenCalledWith('classic-t-shirt', 'USD');
  });
});
