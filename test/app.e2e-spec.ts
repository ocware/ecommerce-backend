import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';
import { OpenAPIObject, setupOpenApi } from '../src/shared/openapi/openapi';
import { ResponseEnvelopeInterceptor } from '../src/shared/response/response-envelope.interceptor';

describe('App', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ecommerce_test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-with-enough-length';

    const { AppModule } = await import('../src/app/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    const configService = app.get(ConfigService);

    const apiPrefix = configService.getOrThrow<string>('app.apiPrefix');
    const apiVersion = configService.getOrThrow<string>('app.apiVersion');
    app.setGlobalPrefix(apiPrefix);
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: apiVersion,
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
    setupOpenApi(app, apiPrefix, apiVersion);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns health status in the standard response envelope', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .get('/api/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          data: {
            status: 'ok',
            service: 'ecommerce-backend',
          },
          meta: {},
          errors: [],
        });
      });
  });

  it('publishes the complete machine-readable OpenAPI contract', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .get('/api/openapi.json')
      .expect(200)
      .expect(({ body }) => {
        const openApiDocument = body as unknown as OpenAPIObject;
        expect(openApiDocument.info).toMatchObject({
          title: 'E-commerce Backend API',
          version: '1',
        });
        expect(openApiDocument.paths['/api/v1/admin/auth/login'].post?.summary).toBe(
          'Sign in a staff member',
        );
        expect(openApiDocument.paths['/api/v1/store/products'].get?.responses['200']).toBeDefined();
        expect(openApiDocument.components?.schemas?.ApiErrorResponse).toBeDefined();
        expect(openApiDocument.components?.securitySchemes?.bearer).toMatchObject({
          type: 'http',
          scheme: 'bearer',
        });
      });
  });
});
