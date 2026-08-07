import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MediaAssetStatus, MediaAssetType, StaffRole } from '@prisma/client';
import request from 'supertest';

import { StaffAuthGuard } from '../src/modules/auth/guards/staff-auth.guard';
import { MediaService } from '../src/modules/media/services/media.service';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';
import { ResponseEnvelopeInterceptor } from '../src/shared/response/response-envelope.interceptor';

describe('Media API', () => {
  const productId = '11111111-1111-4111-8111-111111111111';
  const assetId = '22222222-2222-4222-8222-222222222222';
  let app: INestApplication;
  const mediaService = {
    listAdmin: jest.fn(),
    uploadProductImage: jest.fn(),
    uploadCategoryImage: jest.fn(),
    uploadShopLogo: jest.fn(),
    uploadLibraryAsset: jest.fn(),
    promoteShopLogo: jest.fn(),
    uploadBanner: jest.fn(),
    updateBanner: jest.fn(),
    deleteAsset: jest.fn(),
    getShopLogo: jest.fn(),
    listStoreBanners: jest.fn(),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ecommerce_test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-with-enough-length';

    const { AppModule } = await import('../src/app/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MediaService)
      .useValue(mediaService)
      .overrideGuard(StaffAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { staff?: Record<string, unknown> } };
        }) => {
          context.switchToHttp().getRequest().staff = {
            id: '33333333-3333-4333-8333-333333333333',
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

  it('accepts multipart product images through the protected admin API', async () => {
    mediaService.uploadProductImage.mockResolvedValue({
      id: assetId,
      type: MediaAssetType.PRODUCT_IMAGE,
      status: MediaAssetStatus.READY,
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post(`/api/v1/admin/media/products/${productId}/images`)
      .set('Authorization', 'Bearer token')
      .field('altText', 'Front view')
      .field('position', '2')
      .attach('file', Buffer.from('image-bytes'), {
        filename: 'product.png',
        contentType: 'image/png',
      })
      .expect(201)
      .expect(({ body }: { body: { data: { id: string } } }) => {
        expect(body.data.id).toBe(assetId);
      });

    expect(mediaService.uploadProductImage).toHaveBeenCalledWith(
      productId,
      expect.objectContaining({ altText: 'Front view', position: 2 }),
      expect.objectContaining({ originalname: 'product.png' }),
      '33333333-3333-4333-8333-333333333333',
    );
  });

  it('accepts unbound library uploads through the protected admin API', async () => {
    mediaService.uploadLibraryAsset.mockResolvedValue({
      id: assetId,
      type: MediaAssetType.LIBRARY,
      status: MediaAssetStatus.PROCESSING,
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/api/v1/admin/media/library')
      .set('Authorization', 'Bearer token')
      .field('altText', 'Gallery asset')
      .attach('file', Buffer.from('image-bytes'), {
        filename: 'library.png',
        contentType: 'image/png',
      })
      .expect(201)
      .expect(({ body }: { body: { data: { id: string; type: MediaAssetType } } }) => {
        expect(body.data.id).toBe(assetId);
        expect(body.data.type).toBe(MediaAssetType.LIBRARY);
      });

    expect(mediaService.uploadLibraryAsset).toHaveBeenCalledWith(
      expect.objectContaining({ altText: 'Gallery asset' }),
      expect.objectContaining({ originalname: 'library.png' }),
      '33333333-3333-4333-8333-333333333333',
    );
  });

  it('lists media filtered by type including LIBRARY', async () => {
    mediaService.listAdmin.mockResolvedValue({
      items: [{ id: assetId, type: MediaAssetType.LIBRARY }],
      pagination: { page: 1, limit: 100, total: 1, pageCount: 1 },
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .get('/api/v1/admin/media')
      .query({ type: 'LIBRARY', limit: 100 })
      .set('Authorization', 'Bearer token')
      .expect(200)
      .expect(({ body }: { body: { data: { items: Array<{ type: string }> } } }) => {
        expect(body.data.items[0].type).toBe(MediaAssetType.LIBRARY);
      });

    expect(mediaService.listAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ type: MediaAssetType.LIBRARY, limit: 100 }),
    );
  });

  it('exposes only service-selected active banners on the storefront', async () => {
    mediaService.listStoreBanners.mockResolvedValue([
      { id: assetId, type: MediaAssetType.BANNER, status: MediaAssetStatus.READY },
    ]);
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .get('/api/v1/store/media/banners')
      .expect(200)
      .expect(({ body }: { body: { data: Array<{ id: string }> } }) => {
        expect(body.data[0].id).toBe(assetId);
      });
  });

  it('deletes managed media through its lifecycle endpoint', async () => {
    mediaService.deleteAsset.mockResolvedValue({
      id: assetId,
      status: MediaAssetStatus.DELETED,
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .delete(`/api/v1/admin/media/${assetId}`)
      .set('Authorization', 'Bearer token')
      .expect(200)
      .expect(({ body }: { body: { data: { status: MediaAssetStatus } } }) => {
        expect(body.data.status).toBe(MediaAssetStatus.DELETED);
      });
  });
});
