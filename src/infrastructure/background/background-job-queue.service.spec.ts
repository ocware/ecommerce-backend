import { Queue } from 'bullmq';
import Redis from 'ioredis';

import { FeatureToggleService } from '../../shared/features/feature-toggle.service';
import { BackgroundJobQueue } from './background-job-queue.service';
import { BACKGROUND_QUEUE_NAME, BackgroundJobName } from './background-job.types';

jest.mock('bullmq', () => ({ Queue: jest.fn() }));

describe('BackgroundJobQueue', () => {
  const add = jest.fn(() => Promise.resolve({ id: 'job-id' }));
  const upsertJobScheduler = jest.fn(() => Promise.resolve({ id: 'scheduled-job' }));
  const removeJobScheduler = jest.fn(() => Promise.resolve(true));
  const close = jest.fn(() => Promise.resolve());
  const enabledFeatures = { isEnabled: jest.fn(() => true) };

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(Queue)
      .mockImplementation(
        () =>
          ({ add, upsertJobScheduler, removeJobScheduler, close }) as unknown as InstanceType<
            typeof Queue
          >,
      );
  });

  it('adds retryable jobs with bounded retention defaults', async () => {
    const service = new BackgroundJobQueue(
      {} as Redis,
      enabledFeatures as unknown as FeatureToggleService,
    );

    const result = await service.add(BackgroundJobName.IMAGE_PROCESSING, {
      mediaAssetId: 'asset-id',
    });

    expect(Queue).toHaveBeenCalledWith(
      BACKGROUND_QUEUE_NAME,
      expect.objectContaining({
        defaultJobOptions: expect.objectContaining({
          attempts: 5,
          backoff: { type: 'exponential', delay: 1_000 },
        }) as Record<string, unknown>,
      }),
    );
    expect(add).toHaveBeenCalledWith(
      BackgroundJobName.IMAGE_PROCESSING,
      { mediaAssetId: 'asset-id' },
      undefined,
    );
    expect(result).toEqual({ id: 'job-id', name: BackgroundJobName.IMAGE_PROCESSING });
  });

  it('registers reservation, tracking, and report schedules', async () => {
    const service = new BackgroundJobQueue(
      {} as Redis,
      enabledFeatures as unknown as FeatureToggleService,
    );

    await service.registerRecurringJobs();

    expect(upsertJobScheduler).toHaveBeenCalledTimes(3);
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'expired-reservations-every-minute',
      { every: 60_000 },
      expect.objectContaining({ name: BackgroundJobName.EXPIRED_RESERVATION_RELEASE }),
    );
  });

  it('removes the report schedule when reports are disabled', async () => {
    const service = new BackgroundJobQueue(
      {} as Redis,
      { isEnabled: jest.fn(() => false) } as unknown as FeatureToggleService,
    );

    await service.registerRecurringJobs();

    expect(removeJobScheduler).toHaveBeenCalledWith('daily-sales-report');
    expect(upsertJobScheduler).toHaveBeenCalledTimes(2);
  });
});
