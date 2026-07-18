import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './app/worker.module';

async function bootstrapWorker() {
  const logger = new Logger('Worker');
  await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  logger.log('Worker context started');
}

void bootstrapWorker();
