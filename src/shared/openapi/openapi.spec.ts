import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { createOpenApiDocument, OpenAPIObject, OperationObject, ParameterObject } from './openapi';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

describe('OpenAPI contract', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ecommerce_test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-with-enough-length';

    const { AppModule } = await import('../../app/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();

    const configService = app.get(ConfigService);
    app.setGlobalPrefix(configService.getOrThrow<string>('app.apiPrefix'));
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: configService.getOrThrow<string>('app.apiVersion'),
    });

    document = createOpenApiDocument(app, configService.getOrThrow<string>('app.apiVersion'));
  });

  afterAll(async () => {
    await app.close();
  });

  it('documents every generated operation with stable details and standard responses', () => {
    const operations = getOperations(document);

    expect(operations.length).toBeGreaterThan(100);
    for (const { method, path, operation } of operations) {
      expect(path === '/api/health' || path.startsWith('/api/v1/')).toBe(true);
      expect(operation.operationId).toMatch(/^[A-Za-z]+Controller\.[A-Za-z]+$/);
      expect(operation.tags).not.toHaveLength(0);
      expect(operation.summary).toEqual(expect.any(String));
      expect(operation.summary?.trim()).not.toBe('');
      expect(operation.description).toContain('standard API envelope');
      expect(Object.keys(operation.responses).some((status) => /^2\d\d$/.test(status))).toBe(true);
      expect(operation.responses['400']).toBeDefined();
      expect(operation.responses['429']).toBeDefined();
      expect(operation.responses['500']).toBeDefined();

      if (operation.security?.length) {
        expect(operation.responses['401']).toBeDefined();
      }
      if (operation.security?.length && path.includes('/admin/')) {
        expect(operation.responses['403']).toBeDefined();
      }
      if (method !== 'get') {
        expect(operation.responses['409']).toBeDefined();
      }
    }
  });

  it('describes every used tag and schema field', () => {
    const documentedTags = new Map(
      (document.tags ?? []).map((tag) => [tag.name, tag.description?.trim()]),
    );
    const usedTags = new Set(
      getOperations(document).flatMap(({ operation }) => operation.tags ?? []),
    );

    for (const tag of usedTags) {
      expect(documentedTags.get(tag)).toEqual(expect.any(String));
      expect(documentedTags.get(tag)).not.toBe('');
    }

    for (const schema of Object.values(document.components?.schemas ?? {})) {
      if ('$ref' in schema) {
        continue;
      }
      expect(schema.description).toEqual(expect.any(String));
      for (const property of Object.values(schema.properties ?? {})) {
        if (!('$ref' in property)) {
          expect(property.description).toEqual(expect.any(String));
        }
      }
    }
  });

  it('documents envelopes, security headers, and binary media uploads accurately', () => {
    expect(document.components?.schemas?.ApiSuccessResponse).toBeDefined();
    expect(document.components?.schemas?.ApiErrorResponse).toBeDefined();
    expect(document.components?.securitySchemes?.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });

    const operations = getOperations(document);
    const cartTokenParameters = operations.flatMap(({ operation }) =>
      (operation.parameters ?? []).filter(
        (parameter): parameter is ParameterObject =>
          !('$ref' in parameter) && parameter.name === 'x-cart-token',
      ),
    );
    const idempotencyParameters = operations.flatMap(({ operation }) =>
      (operation.parameters ?? []).filter(
        (parameter): parameter is ParameterObject =>
          !('$ref' in parameter) && parameter.name === 'Idempotency-Key',
      ),
    );
    expect(cartTokenParameters.length).toBeGreaterThan(0);
    expect(idempotencyParameters.length).toBeGreaterThan(0);
    expect(
      cartTokenParameters.every((parameter) => parameter.description && parameter.example),
    ).toBe(true);
    expect(
      idempotencyParameters.every((parameter) => parameter.description && parameter.example),
    ).toBe(true);

    const uploadOperations = operations.filter(({ operation }) => {
      if (!operation.requestBody || '$ref' in operation.requestBody) {
        return false;
      }
      return Boolean(operation.requestBody.content['multipart/form-data']);
    });
    expect(uploadOperations).toHaveLength(5);
    for (const { operation } of uploadOperations) {
      const requestBody = operation.requestBody;
      if (!requestBody || '$ref' in requestBody) {
        throw new Error('Expected an inline multipart request body');
      }
      const multipartSchema = requestBody.content['multipart/form-data'].schema;
      if (!multipartSchema || '$ref' in multipartSchema) {
        throw new Error('Expected an inline multipart schema');
      }
      const fileSchema = multipartSchema.allOf
        ?.filter((schema) => !('$ref' in schema))
        .map((schema) => ('$ref' in schema ? undefined : schema.properties?.file))
        .find(Boolean);
      expect(fileSchema).toMatchObject({ type: 'string', format: 'binary' });
    }
  });
});

function getOperations(document: OpenAPIObject): Array<{
  method: (typeof HTTP_METHODS)[number];
  path: string;
  operation: OperationObject;
}> {
  return Object.entries(document.paths).flatMap(([path, pathItem]) =>
    HTTP_METHODS.flatMap((method) => {
      const operation = pathItem[method];
      return operation ? [{ method, path, operation }] : [];
    }),
  );
}
