import { AuthEventPublisher } from '../../auth/services/auth-event-publisher.service';
import { BackgroundJobQueue } from '../../../infrastructure/background/background-job-queue.service';
import { BackgroundJobName } from '../../../infrastructure/background/background-job.types';
import { CustomerEventPublisher } from '../../customers/services/customer-event-publisher.service';
import { InventoryEventPublisher } from '../../inventory/services/inventory-event-publisher.service';
import { OrdersService } from '../../orders/services/orders.service';
import { OrderEventPublisher } from '../../orders/services/order-event-publisher.service';
import { PaymentEventPublisher } from '../../payments/services/payment-event-publisher.service';
import { ShipmentEventPublisher } from '../../shipping/services/shipment-event-publisher.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationEventListener } from './notification-event-listener.service';

describe('NotificationEventListener', () => {
  const orderId = '11111111-1111-4111-8111-111111111111';
  const order = {
    id: orderId,
    orderNumber: 'ORD-1001',
    customerId: 'customer-id',
    customer: {
      name: 'Customer',
      email: 'customer@example.test',
      phone: '+12025550123',
    },
    total: '50.00',
    currency: 'USD',
  };
  const notifications = {
    sendEmail: jest.fn(() => Promise.resolve()),
    sendSms: jest.fn(() => Promise.resolve()),
    sendAdmin: jest.fn(() => Promise.resolve()),
  };
  const ordersService = { getNotificationOrder: jest.fn(() => Promise.resolve(order)) };
  const backgroundJobs = { add: jest.fn(() => Promise.resolve({ id: 'job-id' })) };
  const orderEvents = new OrderEventPublisher();
  const paymentEvents = new PaymentEventPublisher();
  const shipmentEvents = new ShipmentEventPublisher();
  const authEvents = new AuthEventPublisher();
  const customerEvents = new CustomerEventPublisher();
  const inventoryEvents = new InventoryEventPublisher();
  const listener = new NotificationEventListener(
    notifications as unknown as NotificationDeliveryService,
    backgroundJobs as unknown as BackgroundJobQueue,
    ordersService as unknown as OrdersService,
    orderEvents,
    paymentEvents,
    shipmentEvents,
    authEvents,
    customerEvents,
    inventoryEvents,
  );

  beforeAll(() => listener.onModuleInit());
  beforeEach(() => jest.clearAllMocks());
  afterAll(() => listener.onModuleDestroy());

  it('subscribes to order, payment, and shipment events', async () => {
    orderEvents.publish({
      name: 'OrderCreated',
      occurredAt: new Date(),
      orderId,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      total: order.total,
      currency: order.currency,
    });
    paymentEvents.publish({
      name: 'PaymentFailed',
      occurredAt: new Date(),
      paymentAttemptId: 'payment-id',
      orderId,
      gateway: 'development',
      failureCode: 'DECLINED',
    });
    shipmentEvents.publish({
      name: 'ShipmentCreated',
      occurredAt: new Date(),
      shipmentId: 'shipment-id',
      orderId,
      provider: 'local',
      trackingCode: 'TRACK-1',
    });
    await thisTurn();

    expect(backgroundJobs.add).toHaveBeenCalledWith(
      BackgroundJobName.EMAIL_DELIVERY,
      expect.objectContaining({ eventName: 'OrderCreated' }),
    );
    expect(backgroundJobs.add).toHaveBeenCalledWith(
      BackgroundJobName.EMAIL_DELIVERY,
      expect.objectContaining({ eventName: 'PaymentFailed' }),
    );
    expect(backgroundJobs.add).toHaveBeenCalledWith(
      BackgroundJobName.EMAIL_DELIVERY,
      expect.objectContaining({ eventName: 'ShipmentCreated' }),
    );
  });

  it('subscribes to password reset, customer registration, and low-stock events', async () => {
    authEvents.publish({
      name: 'PasswordResetRequested',
      occurredAt: new Date(),
      passwordResetTokenId: 'reset-request-id',
      staffUserId: 'staff-id',
      email: 'staff@example.test',
      resetToken: 'reset-token',
      expiresAt: new Date(Date.now() + 60_000),
    });
    customerEvents.publish({
      name: 'CustomerRegistered',
      occurredAt: new Date(),
      customerId: 'customer-id',
      email: 'customer@example.test',
      phone: '+12025550123',
      customerName: 'Customer',
    });
    inventoryEvents.publish({
      name: 'InventoryLow',
      occurredAt: new Date(),
      eventId: 'inventory-id:2',
      inventoryItemId: 'inventory-id',
      variantId: 'variant-id',
      availableStock: 1,
      lowStockThreshold: 2,
    });
    await thisTurn();

    expect(backgroundJobs.add).toHaveBeenCalledWith(
      BackgroundJobName.EMAIL_DELIVERY,
      expect.objectContaining({ eventName: 'PasswordResetRequested' }),
    );
    expect(backgroundJobs.add).toHaveBeenCalledWith(
      BackgroundJobName.SMS_DELIVERY,
      expect.objectContaining({ eventName: 'CustomerRegistered' }),
    );
    expect(notifications.sendAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'InventoryLow' }),
    );
  });
});

function thisTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
