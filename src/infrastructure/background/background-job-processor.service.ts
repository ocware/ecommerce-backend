import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';

import { OptionalFeature } from '../../shared/features/feature-toggle';
import { FeatureToggleService } from '../../shared/features/feature-toggle.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { BackgroundJobQueue } from './background-job-queue.service';
import {
  BACKGROUND_QUEUE_NAME,
  BackgroundJobData,
  BackgroundJobName,
  BackgroundJobPayloads,
} from './background-job.types';
import { EmailDeliveryJob } from './jobs/email-delivery.job';
import { ExpiredReservationReleaseJob } from './jobs/expired-reservation-release.job';
import { ImageProcessingJob } from './jobs/image-processing.job';
import { InvoiceGenerationJob } from './jobs/invoice-generation.job';
import { PaymentCallbackJob } from './jobs/payment-callback.job';
import { ReportGenerationJob } from './jobs/report-generation.job';
import { ShipmentTrackingUpdateJob } from './jobs/shipment-tracking-update.job';
import { SmsDeliveryJob } from './jobs/sms-delivery.job';

@Injectable()
export class BackgroundJobProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackgroundJobProcessor.name);
  private worker?: Worker<BackgroundJobData, unknown, BackgroundJobName>;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly queue: BackgroundJobQueue,
    private readonly emailDelivery: EmailDeliveryJob,
    private readonly smsDelivery: SmsDeliveryJob,
    private readonly imageProcessing: ImageProcessingJob,
    private readonly invoiceGeneration: InvoiceGenerationJob,
    private readonly paymentCallback: PaymentCallbackJob,
    private readonly expiredReservationRelease: ExpiredReservationReleaseJob,
    private readonly shipmentTrackingUpdate: ShipmentTrackingUpdateJob,
    private readonly reportGeneration: ReportGenerationJob,
    private readonly features: FeatureToggleService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.registerRecurringJobs();
    this.worker = new Worker<BackgroundJobData, unknown, BackgroundJobName>(
      BACKGROUND_QUEUE_NAME,
      (job) => this.process(job),
      {
        connection: this.redis.duplicate({ maxRetriesPerRequest: null }),
        concurrency: 10,
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Job ${job?.name ?? 'unknown'} (${job?.id ?? 'unknown'}) failed`,
        error.stack,
      );
    });
    this.logger.log(`Listening on ${BACKGROUND_QUEUE_NAME}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private process(job: Job<BackgroundJobData, unknown, BackgroundJobName>): Promise<unknown> {
    const requiredFeature = this.requiredFeature(job.name);
    if (requiredFeature && !this.features.isEnabled(requiredFeature)) {
      this.logger.log(`Skipped ${job.name} because ${requiredFeature} is disabled.`);
      return Promise.resolve({ skipped: true, feature: requiredFeature });
    }

    switch (job.name) {
      case BackgroundJobName.EMAIL_DELIVERY:
        return this.emailDelivery.handle(
          job.data as BackgroundJobPayloads[BackgroundJobName.EMAIL_DELIVERY],
        );
      case BackgroundJobName.SMS_DELIVERY:
        return this.smsDelivery.handle(
          job.data as BackgroundJobPayloads[BackgroundJobName.SMS_DELIVERY],
        );
      case BackgroundJobName.IMAGE_PROCESSING:
        return this.imageProcessing.handle(
          job.data as BackgroundJobPayloads[BackgroundJobName.IMAGE_PROCESSING],
        );
      case BackgroundJobName.INVOICE_GENERATION:
        return this.invoiceGeneration.handle(
          job.data as BackgroundJobPayloads[BackgroundJobName.INVOICE_GENERATION],
        );
      case BackgroundJobName.PAYMENT_CALLBACK:
        return this.paymentCallback.handle(
          job.data as BackgroundJobPayloads[BackgroundJobName.PAYMENT_CALLBACK],
        );
      case BackgroundJobName.EXPIRED_RESERVATION_RELEASE:
        return this.expiredReservationRelease.handle(
          job.data as BackgroundJobPayloads[BackgroundJobName.EXPIRED_RESERVATION_RELEASE],
        );
      case BackgroundJobName.SHIPMENT_TRACKING_UPDATE:
        return this.shipmentTrackingUpdate.handle(
          job.data as BackgroundJobPayloads[BackgroundJobName.SHIPMENT_TRACKING_UPDATE],
        );
      case BackgroundJobName.REPORT_GENERATION:
        return this.reportGeneration.handle(
          job.data as BackgroundJobPayloads[BackgroundJobName.REPORT_GENERATION],
        );
      default:
        return Promise.reject(new Error(`Unsupported background job: ${String(job.name)}`));
    }
  }

  private requiredFeature(jobName: BackgroundJobName): OptionalFeature | undefined {
    switch (jobName) {
      case BackgroundJobName.EMAIL_DELIVERY:
      case BackgroundJobName.SMS_DELIVERY:
        return OptionalFeature.NOTIFICATIONS;
      case BackgroundJobName.IMAGE_PROCESSING:
        return OptionalFeature.MEDIA;
      case BackgroundJobName.REPORT_GENERATION:
        return OptionalFeature.REPORTS;
      default:
        return undefined;
    }
  }
}
