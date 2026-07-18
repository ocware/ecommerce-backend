import { Module } from '@nestjs/common';

import { InventoryModule } from '../../modules/inventory/inventory.module';
import { MediaModule } from '../../modules/media/media.module';
import { NotificationsModule } from '../../modules/notifications/notifications.module';
import { OrdersModule } from '../../modules/orders/orders.module';
import { PaymentsModule } from '../../modules/payments/payments.module';
import { ReportsModule } from '../../modules/reports/reports.module';
import { ShippingModule } from '../../modules/shipping/shipping.module';
import { BackgroundJobProcessor } from './background-job-processor.service';
import { EmailDeliveryJob } from './jobs/email-delivery.job';
import { ExpiredReservationReleaseJob } from './jobs/expired-reservation-release.job';
import { ImageProcessingJob } from './jobs/image-processing.job';
import { InvoiceGenerationJob } from './jobs/invoice-generation.job';
import { PaymentCallbackJob } from './jobs/payment-callback.job';
import { ReportGenerationJob } from './jobs/report-generation.job';
import { ShipmentTrackingUpdateJob } from './jobs/shipment-tracking-update.job';
import { SmsDeliveryJob } from './jobs/sms-delivery.job';

@Module({
  imports: [
    InventoryModule,
    MediaModule,
    NotificationsModule,
    OrdersModule,
    PaymentsModule,
    ReportsModule,
    ShippingModule,
  ],
  providers: [
    BackgroundJobProcessor,
    EmailDeliveryJob,
    SmsDeliveryJob,
    ImageProcessingJob,
    InvoiceGenerationJob,
    PaymentCallbackJob,
    ExpiredReservationReleaseJob,
    ShipmentTrackingUpdateJob,
    ReportGenerationJob,
  ],
})
export class JobHandlersModule {}
