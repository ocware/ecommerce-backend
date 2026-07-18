import { NotificationStatus } from '@prisma/client';

import { InventoryService } from '../../../modules/inventory/services/inventory.service';
import { ImageResizingJob } from '../../../modules/media/jobs/image-resizing.job';
import { NotificationDeliveryService } from '../../../modules/notifications/services/notification-delivery.service';
import { OrdersService } from '../../../modules/orders/services/orders.service';
import { PaymentGatewayName } from '../../../modules/payments/contracts/payment-gateway';
import { PaymentsService } from '../../../modules/payments/services/payments.service';
import { ReportsService } from '../../../modules/reports/services/reports.service';
import { ShippingService } from '../../../modules/shipping/services/shipping.service';
import { EmailDeliveryJob } from './email-delivery.job';
import { ExpiredReservationReleaseJob } from './expired-reservation-release.job';
import { ImageProcessingJob } from './image-processing.job';
import { InvoiceGenerationJob } from './invoice-generation.job';
import { PaymentCallbackJob } from './payment-callback.job';
import { ReportGenerationJob } from './report-generation.job';
import { ShipmentTrackingUpdateJob } from './shipment-tracking-update.job';
import { SmsDeliveryJob } from './sms-delivery.job';

describe('background job handlers', () => {
  const notification = {
    status: NotificationStatus.SENT,
    lastError: null,
  };
  const notifications = {
    sendEmail: jest.fn<Promise<{ status: NotificationStatus; lastError: string | null }>, []>(() =>
      Promise.resolve(notification),
    ),
    sendSms: jest.fn<Promise<{ status: NotificationStatus; lastError: string | null }>, []>(() =>
      Promise.resolve(notification),
    ),
  };
  const imageResizing = { handle: jest.fn(() => Promise.resolve({ id: 'asset-id' })) };
  const orders = { getAdminOrder: jest.fn(() => Promise.resolve({ id: 'order-id' })) };
  const payments = { processWebhook: jest.fn(() => Promise.resolve({ id: 'attempt-id' })) };
  const inventory = { expireReservations: jest.fn(() => Promise.resolve({ expired: 2 })) };
  const shipping = {
    trackShipment: jest.fn(() => Promise.resolve({ id: 'shipment-id' })),
    refreshShipmentTracking: jest.fn(() => Promise.resolve({ examined: 2 })),
  };
  const reports = {
    getOverview: jest.fn(() => Promise.resolve({ orderCount: 2 })),
    getSalesByDate: jest.fn(),
    getBestSellingProducts: jest.fn(),
    getLowStockProducts: jest.fn(),
    getPaymentStatusSummary: jest.fn(),
    getRefundSummary: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('delivers queued email and SMS and surfaces failures for BullMQ retries', async () => {
    const email = new EmailDeliveryJob(notifications as unknown as NotificationDeliveryService);
    const sms = new SmsDeliveryJob(notifications as unknown as NotificationDeliveryService);
    const data = {
      eventName: 'OrderCreated',
      eventId: 'order-id',
      recipient: 'customer@example.test',
      body: 'Order created.',
    };

    await email.handle(data);
    await sms.handle(data);
    notifications.sendEmail.mockResolvedValueOnce({
      status: NotificationStatus.FAILED,
      lastError: 'Provider unavailable',
    });

    await expect(email.handle(data)).rejects.toThrow('Provider unavailable');
  });

  it('processes image and invoice jobs through owning module APIs', async () => {
    const image = new ImageProcessingJob(imageResizing as unknown as ImageResizingJob);
    const invoice = new InvoiceGenerationJob(orders as unknown as OrdersService);

    await image.handle({ mediaAssetId: 'asset-id' });
    const result = await invoice.handle({ orderId: 'order-id' });

    expect(imageResizing.handle).toHaveBeenCalledWith('asset-id');
    expect(orders.getAdminOrder).toHaveBeenCalledWith('order-id');
    expect(result).toMatchObject({ order: { id: 'order-id' } });
  });

  it('processes payment callbacks and expired reservations idempotently in services', async () => {
    const callback = new PaymentCallbackJob(payments as unknown as PaymentsService);
    const expiration = new ExpiredReservationReleaseJob(inventory as unknown as InventoryService);

    await callback.handle({
      gateway: PaymentGatewayName.DEVELOPMENT,
      payload: { eventId: 'gateway-event' },
    });
    await expiration.handle({ limit: 25 });

    expect(payments.processWebhook).toHaveBeenCalledWith(PaymentGatewayName.DEVELOPMENT, {
      eventId: 'gateway-event',
    });
    expect(inventory.expireReservations).toHaveBeenCalledWith(25);
  });

  it('refreshes one shipment or a bounded batch', async () => {
    const job = new ShipmentTrackingUpdateJob(shipping as unknown as ShippingService);

    await job.handle({ shipmentId: 'shipment-id' });
    await job.handle({ limit: 20 });

    expect(shipping.trackShipment).toHaveBeenCalledWith('shipment-id');
    expect(shipping.refreshShipmentTracking).toHaveBeenCalledWith(20);
  });

  it('generates reports through the read-only Reports API', async () => {
    const job = new ReportGenerationJob(reports as unknown as ReportsService);

    await job.handle({ report: 'overview', query: { currency: 'USD' } });

    expect(reports.getOverview).toHaveBeenCalledWith({ currency: 'USD' });
  });
});
