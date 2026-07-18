import { Notification, NotificationChannel, NotificationStatus } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { NotificationDeliveryService } from './notification-delivery.service';

describe('NotificationDeliveryService', () => {
  const now = new Date();
  const pending: Notification = {
    id: '11111111-1111-4111-8111-111111111111',
    eventName: 'OrderCreated',
    eventId: 'order-id',
    channel: NotificationChannel.EMAIL,
    recipient: 'customer@example.test',
    subject: 'Order received',
    body: 'Your order was received.',
    status: NotificationStatus.PENDING,
    provider: null,
    providerMessageId: null,
    attempts: 0,
    lastError: null,
    metadata: null,
    sentAt: null,
    readAt: null,
    readByStaffUserId: null,
    createdAt: now,
    updatedAt: now,
  };
  const prisma = {
    notification: {
      upsert: jest.fn(() => pending),
      update: jest.fn((input: { data: object }) => ({ ...pending, ...input.data })),
      findUnique: jest.fn(() => pending),
      count: jest.fn(() => 0),
      findMany: jest.fn(() => []),
    },
    $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
  };
  const emailProvider = {
    name: 'test-email',
    send: jest.fn(() => Promise.resolve({ messageId: 'email-message-id' })),
  };
  const smsProvider = {
    name: 'test-sms',
    send: jest.fn(() => Promise.resolve({ messageId: 'sms-message-id' })),
  };
  const service = new NotificationDeliveryService(
    prisma as unknown as PrismaService,
    emailProvider,
    smsProvider,
  );

  beforeEach(() => jest.clearAllMocks());

  it('delivers email and records provider delivery details', async () => {
    await service.sendEmail({
      eventName: 'OrderCreated',
      eventId: 'order-id',
      recipient: 'customer@example.test',
      subject: 'Order received',
      body: 'Your order was received.',
    });

    expect(emailProvider.send).toHaveBeenCalledWith({
      to: 'customer@example.test',
      subject: 'Order received',
      text: 'Your order was received.',
    });
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: pending.id },
      data: expect.objectContaining({
        status: NotificationStatus.SENT,
        provider: 'test-email',
        providerMessageId: 'email-message-id',
      }) as Record<string, unknown>,
    });
  });

  it('does not redeliver an event that was already sent', async () => {
    prisma.notification.upsert.mockReturnValueOnce({
      ...pending,
      status: NotificationStatus.SENT,
    });

    await service.sendEmail({
      eventName: 'OrderCreated',
      eventId: 'order-id',
      recipient: 'customer@example.test',
      body: 'Your order was received.',
    });

    expect(emailProvider.send).not.toHaveBeenCalled();
  });

  it('persists provider failures so they can be retried', async () => {
    smsProvider.send.mockRejectedValueOnce(new Error('provider unavailable'));
    prisma.notification.upsert.mockReturnValueOnce({
      ...pending,
      channel: NotificationChannel.SMS,
      recipient: '+12025550123',
    });

    await service.sendSms({
      eventName: 'OrderCreated',
      eventId: 'order-id',
      recipient: '+12025550123',
      body: 'Order received.',
    });

    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: pending.id },
      data: {
        status: NotificationStatus.FAILED,
        provider: 'test-sms',
        attempts: { increment: 1 },
        lastError: 'provider unavailable',
      },
    });
  });

  it('creates idempotent in-app admin notifications', async () => {
    await service.sendAdmin({
      eventName: 'InventoryLow',
      eventId: 'inventory-id:2',
      subject: 'Low inventory',
      body: 'Only one item remains.',
    });

    expect(prisma.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          channel: NotificationChannel.ADMIN,
          recipient: 'staff',
          status: NotificationStatus.SENT,
        }) as Record<string, unknown>,
      }),
    );
  });
});
