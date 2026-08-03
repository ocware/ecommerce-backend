import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Notification, NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { SMS_PROVIDER, SmsProvider } from '../../../shared/communications/sms-provider';
import { EMAIL_PROVIDER, EmailProvider } from '../contracts/email-provider';
import { ListNotificationsQueryDto } from '../dto/list-notifications-query.dto';

export type NotificationInput = {
  eventName: string;
  eventId: string;
  recipient: string;
  subject?: string;
  body: string;
  deliveryBody?: string;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class NotificationDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {}

  sendEmail(input: NotificationInput) {
    return this.createAndDeliver(NotificationChannel.EMAIL, input);
  }

  sendSms(input: NotificationInput) {
    return this.createAndDeliver(NotificationChannel.SMS, input);
  }

  async sendAdmin(input: Omit<NotificationInput, 'recipient'>) {
    const { deliveryBody, ...recordInput } = input;
    void deliveryBody;
    return this.prisma.notification.upsert({
      where: {
        eventName_eventId_channel_recipient: {
          eventName: input.eventName,
          eventId: input.eventId,
          channel: NotificationChannel.ADMIN,
          recipient: 'staff',
        },
      },
      create: {
        ...recordInput,
        recipient: 'staff',
        channel: NotificationChannel.ADMIN,
        status: NotificationStatus.SENT,
        attempts: 1,
        sentAt: new Date(),
      },
      update: {},
    });
  }

  async retry(id: string) {
    const notification = await this.requireNotification(id);
    if (notification.eventName === 'PasswordResetRequested') {
      throw new ConflictException({
        code: 'SENSITIVE_NOTIFICATION_NOT_RETRYABLE',
        message: 'Request a new password reset instead of retrying expired instructions.',
      });
    }
    if (
      notification.channel === NotificationChannel.ADMIN ||
      notification.status !== NotificationStatus.FAILED
    ) {
      throw new ConflictException({
        code: 'NOTIFICATION_NOT_RETRYABLE',
        message: 'Only failed email or SMS notifications can be retried.',
      });
    }
    return this.deliver(notification);
  }

  async markRead(id: string, staffUserId: string) {
    const notification = await this.requireNotification(id);
    if (notification.channel !== NotificationChannel.ADMIN) {
      throw new ConflictException({
        code: 'NOT_ADMIN_NOTIFICATION',
        message: 'Only admin notifications can be marked as read.',
      });
    }
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: notification.readAt ?? new Date(), readByStaffUserId: staffUserId },
    });
  }

  async list(query: ListNotificationsQueryDto) {
    const where: Prisma.NotificationWhereInput = {
      channel: query.channel,
      status: query.status,
      readAt: query.unreadOnly ? null : undefined,
    };
    const skip = (query.page - 1) * query.limit;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
    ]);
    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pageCount: Math.ceil(total / query.limit),
      },
    };
  }

  private async createAndDeliver(channel: NotificationChannel, input: NotificationInput) {
    const { deliveryBody, ...recordInput } = input;
    const notification = await this.prisma.notification.upsert({
      where: {
        eventName_eventId_channel_recipient: {
          eventName: input.eventName,
          eventId: input.eventId,
          channel,
          recipient: input.recipient,
        },
      },
      create: { ...recordInput, channel },
      update: {},
    });
    if (notification.status === NotificationStatus.SENT) return notification;
    return this.deliver(notification, deliveryBody);
  }

  private async deliver(notification: Notification, deliveryBody?: string) {
    try {
      const result =
        notification.channel === NotificationChannel.EMAIL
          ? await this.emailProvider.send({
              to: notification.recipient,
              subject: notification.subject ?? 'Store notification',
              text: deliveryBody ?? notification.body,
            })
          : await this.smsProvider.send({
              to: notification.recipient,
              message: deliveryBody ?? notification.body,
            });
      return this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.SENT,
          provider:
            notification.channel === NotificationChannel.EMAIL
              ? this.emailProvider.name
              : this.smsProvider.name,
          providerMessageId: result.messageId,
          attempts: { increment: 1 },
          lastError: null,
          sentAt: new Date(),
        },
      });
    } catch (error) {
      return this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.FAILED,
          provider:
            notification.channel === NotificationChannel.EMAIL
              ? this.emailProvider.name
              : this.smsProvider.name,
          attempts: { increment: 1 },
          lastError: error instanceof Error ? error.message.slice(0, 1_000) : 'Unknown error',
        },
      });
    }
  }

  private async requireNotification(id: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) {
      throw new NotFoundException({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'Notification was not found.',
      });
    }
    return notification;
  }
}
