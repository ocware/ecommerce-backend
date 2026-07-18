import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Job, JobsOptions, Queue } from 'bullmq';
import Redis from 'ioredis';

import { OptionalFeature } from '../../shared/features/feature-toggle';
import { FeatureToggleService } from '../../shared/features/feature-toggle.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import {
  BACKGROUND_QUEUE_NAME,
  BackgroundJobData,
  BackgroundJobName,
  BackgroundJobPayloads,
} from './background-job.types';

@Injectable()
export class BackgroundJobQueue implements OnModuleDestroy {
  private queue?: Queue<BackgroundJobData, unknown, string>;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly features: FeatureToggleService,
  ) {}

  private getQueue(): Queue<BackgroundJobData, unknown, string> {
    this.queue ??= new Queue(BACKGROUND_QUEUE_NAME, {
      connection: this.redis,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 },
      },
    });
    return this.queue;
  }

  async add<Name extends BackgroundJobName>(
    name: Name,
    data: BackgroundJobPayloads[Name],
    options?: JobsOptions,
  ): Promise<{ id: string | undefined; name: Name }> {
    const job = (await this.getQueue().add(name, data, options)) as Job<
      BackgroundJobData,
      unknown,
      Name
    >;
    return { id: job.id, name };
  }

  async registerRecurringJobs(): Promise<void> {
    const queue = this.getQueue();
    const schedules: Promise<unknown>[] = [
      queue.upsertJobScheduler(
        'expired-reservations-every-minute',
        { every: 60_000 },
        {
          name: BackgroundJobName.EXPIRED_RESERVATION_RELEASE,
          data: { limit: 100 },
        },
      ),
      queue.upsertJobScheduler(
        'shipment-tracking-every-fifteen-minutes',
        { every: 15 * 60_000 },
        {
          name: BackgroundJobName.SHIPMENT_TRACKING_UPDATE,
          data: { limit: 100 },
        },
      ),
    ];
    schedules.push(
      this.features.isEnabled(OptionalFeature.REPORTS)
        ? queue.upsertJobScheduler(
            'daily-sales-report',
            { pattern: '0 0 * * *' },
            {
              name: BackgroundJobName.REPORT_GENERATION,
              data: { report: 'overview' },
            },
          )
        : queue.removeJobScheduler('daily-sales-report'),
    );
    await Promise.all(schedules);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
