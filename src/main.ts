import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app/app.module';
import { HttpExceptionFilter } from './shared/errors/http-exception.filter';
import { RequestLoggingInterceptor } from './shared/logging/request-logging.interceptor';
import { ResponseEnvelopeInterceptor } from './shared/response/response-envelope.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
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
