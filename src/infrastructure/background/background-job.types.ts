import { Prisma } from '@prisma/client';

import { PaymentGatewayName } from '../../modules/payments/contracts/payment-gateway';

export const BACKGROUND_QUEUE_NAME = 'ecommerce-background';

export enum BackgroundJobName {
  EMAIL_DELIVERY = 'email-delivery',
  SMS_DELIVERY = 'sms-delivery',
  IMAGE_PROCESSING = 'image-processing',
  INVOICE_GENERATION = 'invoice-generation',
  PAYMENT_CALLBACK = 'payment-callback',
  EXPIRED_RESERVATION_RELEASE = 'expired-reservation-release',
  SHIPMENT_TRACKING_UPDATE = 'shipment-tracking-update',
  REPORT_GENERATION = 'report-generation',
}

export type NotificationJobData = {
  eventName: string;
  eventId: string;
  recipient: string;
  subject?: string;
  body: string;
  deliveryBody?: string;
  metadata?: Prisma.InputJsonValue;
};

export type ReportJobData = {
  report:
    | 'overview'
    | 'sales-by-date'
    | 'best-selling-products'
    | 'low-stock-products'
    | 'payment-status'
    | 'refunds';
  query?: Record<string, unknown>;
};

export type BackgroundJobPayloads = {
  [BackgroundJobName.EMAIL_DELIVERY]: NotificationJobData;
  [BackgroundJobName.SMS_DELIVERY]: NotificationJobData;
  [BackgroundJobName.IMAGE_PROCESSING]: { mediaAssetId: string };
  [BackgroundJobName.INVOICE_GENERATION]: { orderId: string };
  [BackgroundJobName.PAYMENT_CALLBACK]: {
    gateway: PaymentGatewayName;
    payload: Record<string, unknown>;
  };
  [BackgroundJobName.EXPIRED_RESERVATION_RELEASE]: { limit?: number };
  [BackgroundJobName.SHIPMENT_TRACKING_UPDATE]: { shipmentId?: string; limit?: number };
  [BackgroundJobName.REPORT_GENERATION]: ReportJobData;
};

export type BackgroundJobData = BackgroundJobPayloads[BackgroundJobName];
