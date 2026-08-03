import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subscription } from 'rxjs';

import { OrdersService } from '../../orders/services/orders.service';
import { PaymentEventPublisher } from '../../payments/services/payment-event-publisher.service';
import { AnalyticsService } from './analytics.service';

@Injectable()
export class AnalyticsEventListener implements OnModuleInit, OnModuleDestroy {
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly paymentEvents: PaymentEventPublisher,
    private readonly orders: OrdersService,
    private readonly analytics: AnalyticsService,
  ) {}

  onModuleInit(): void {
    this.subscriptions.add(
      this.paymentEvents.stream().subscribe((event) => {
        if (event.name !== 'PaymentSucceeded') return;
        void this.recordPurchase(event.orderId);
      }),
    );
  }

  onModuleDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private async recordPurchase(orderId: string) {
    const order = await this.orders.getNotificationOrder(orderId);
    await this.analytics.recordOperationalPurchase({
      orderId,
      customerId: order.customerId,
      currency: order.currency,
      value: order.total,
    });
  }
}
