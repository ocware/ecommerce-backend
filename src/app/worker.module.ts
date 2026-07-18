import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { appConfig } from '../config/app.config';
import { validateEnvironment } from '../config/env.validation';
import { BackgroundQueueModule } from '../infrastructure/background/background-queue.module';
import { JobHandlersModule } from '../infrastructure/background/job-handlers.module';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { RedisModule } from '../infrastructure/redis/redis.module';
import { EventsModule } from '../shared/events/events.module';
import { FeaturesModule } from '../shared/features/features.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    RedisModule,
    EventsModule,
    FeaturesModule,
    BackgroundQueueModule,
    JobHandlersModule,
  ],
})
export class WorkerModule {}
