import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { isAbsolute, resolve } from 'node:path';

import { AppModule } from './app/app.module';
import { HttpExceptionFilter } from './shared/errors/http-exception.filter';
import { RequestLoggingInterceptor } from './shared/logging/request-logging.interceptor';
import { ResponseEnvelopeInterceptor } from './shared/response/response-envelope.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const configService = app.get(ConfigService);
  const apiPrefix = configService.getOrThrow<string>('app.apiPrefix');
  const apiVersion = configService.getOrThrow<string>('app.apiVersion');

  if (configService.get<string>('app.mediaStorageDriver') !== 's3') {
    const configuredRoot = configService.get<string>('app.mediaLocalRoot') ?? 'storage/media';
    const rootPath = isAbsolute(configuredRoot)
      ? configuredRoot
      : resolve(process.cwd(), configuredRoot);
    const configuredBaseUrl = configService.get<string>('app.mediaPublicBaseUrl') ?? '/media';
    const prefix = configuredBaseUrl.startsWith('/')
      ? configuredBaseUrl
      : new URL(configuredBaseUrl).pathname;
    app.useStaticAssets(rootPath, { prefix });
  }

  app.setGlobalPrefix(apiPrefix);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: apiVersion,
  });

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor(), new ResponseEnvelopeInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('E-commerce Backend API')
    .setDescription('NestJS modular monolith e-commerce backend')
    .setVersion(apiVersion)
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  const port = configService.getOrThrow<number>('app.port');
  await app.listen(port);
}

void bootstrap();
