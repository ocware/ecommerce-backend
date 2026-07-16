import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app/app.module';

async function bootstrapWorker() {
  const logger = new Logger('Worker');
  await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  logger.log('Worker context started');
}

void bootstrapWorker();
