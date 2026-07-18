import { Injectable } from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';

import { NotificationDeliveryService } from '../../../modules/notifications/services/notification-delivery.service';
import { NotificationJobData } from '../background-job.types';

@Injectable()
export class SmsDeliveryJob {
  constructor(private readonly notifications: NotificationDeliveryService) {}

  async handle(data: NotificationJobData) {
    const notification = await this.notifications.sendSms(data);
    if (notification.status === NotificationStatus.FAILED) {
      throw new Error(notification.lastError ?? 'SMS delivery failed.');
    }
    return notification;
  }
}
