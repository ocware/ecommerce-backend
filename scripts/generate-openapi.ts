import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function generateOpenApi(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/silver_gallery';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
  process.env.JWT_SECRET ??= 'openapi-generation-only-secret';

  const [{ AppModule }, { createOpenApiDocument }] = await Promise.all([
    import('../src/app/app.module'),
    import('../src/shared/openapi/openapi'),
  ]);
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  await app.init();

  const document = createOpenApiDocument(app, '1');
  await writeFile(resolve(process.cwd(), 'openapi.json'), `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
}

void generateOpenApi();
