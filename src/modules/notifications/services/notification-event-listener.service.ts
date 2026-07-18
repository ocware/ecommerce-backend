import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subscription } from 'rxjs';

import { BackgroundJobQueue } from '../../../infrastructure/background/background-job-queue.service';
import { BackgroundJobName } from '../../../infrastructure/background/background-job.types';
import { OptionalFeature } from '../../../shared/features/feature-toggle';
import { FeatureToggleService } from '../../../shared/features/feature-toggle.service';
import { AuthDomainEvent } from '../../auth/domain/auth-events';
import { AuthEventPublisher } from '../../auth/services/auth-event-publisher.service';
import { CustomerDomainEvent } from '../../customers/domain/customer-events';
import { CustomerEventPublisher } from '../../customers/services/customer-event-publisher.service';
import { InventoryDomainEvent } from '../../inventory/domain/inventory-events';
import { InventoryEventPublisher } from '../../inventory/services/inventory-event-publisher.service';
import { OrderDomainEvent } from '../../orders/domain/order-events';
import { NotificationOrderView, OrdersService } from '../../orders/services/orders.service';
import { OrderEventPublisher } from '../../orders/services/order-event-publisher.service';
import { PaymentDomainEvent } from '../../payments/domain/payment-events';
import { PaymentEventPublisher } from '../../payments/services/payment-event-publisher.service';
import { ShipmentDomainEvent } from '../../shipping/domain/shipment-events';
import { ShipmentEventPublisher } from '../../shipping/services/shipment-event-publisher.service';
import { NotificationDeliveryService } from './notification-delivery.service';

@Injectable()
export class NotificationEventListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationEventListener.name);
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly notifications: NotificationDeliveryService,
    private readonly backgroundJobs: BackgroundJobQueue,
    private readonly ordersService: OrdersService,
    private readonly orderEvents: OrderEventPublisher,
    private readonly paymentEvents: PaymentEventPublisher,
    private readonly shipmentEvents: ShipmentEventPublisher,
    private readonly authEvents: AuthEventPublisher,
    private readonly customerEvents: CustomerEventPublisher,
    private readonly inventoryEvents: InventoryEventPublisher,
    private readonly features: FeatureToggleService,
  ) {}

  onModuleInit(): void {
    if (!this.features.isEnabled(OptionalFeature.NOTIFICATIONS)) {
      this.logger.log('Notification feature disabled; event subscriptions were not started.');
      return;
    }
    this.subscribe(this.orderEvents, (event) => this.handleOrder(event));
    this.subscribe(this.paymentEvents, (event) => this.handlePayment(event));
    this.subscribe(this.shipmentEvents, (event) => this.handleShipment(event));
    this.subscribe(this.authEvents, (event) => this.handleAuth(event));
    this.subscribe(this.customerEvents, (event) => this.handleCustomer(event));
    this.subscribe(this.inventoryEvents, (event) => this.handleInventory(event));
  }

  onModuleDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private subscribe<T>(
    publisher: { stream: () => import('rxjs').Observable<T> },
    handler: (event: T) => Promise<void>,
  ) {
    this.subscriptions.add(
      publisher.stream().subscribe((event) => {
        void handler(event).catch((error: unknown) => {
          this.logger.error(
            error instanceof Error ? error.message : 'Notification listener failed.',
          );
        });
      }),
    );
  }

  private async handleOrder(event: OrderDomainEvent): Promise<void> {
    const order = await this.ordersService.getNotificationOrder(event.orderId);
    if (event.name === 'OrderCreated') {
      await this.backgroundJobs.add(BackgroundJobName.INVOICE_GENERATION, {
        orderId: event.orderId,
      });
      await this.notifyCustomer(
        event.name,
        event.orderId,
        order,
        `Order ${event.orderNumber} received`,
        `We received order ${event.orderNumber} for ${event.total} ${event.currency}.`,
      );
      await this.notifications.sendAdmin({
        eventName: event.name,
        eventId: event.orderId,
        subject: 'New order',
        body: `Order ${event.orderNumber} was created for ${event.total} ${event.currency}.`,
        metadata: { orderId: event.orderId, severity: 'info' },
      });
      return;
    }

    await this.notifyCustomer(
      event.name,
      event.orderId,
      order,
      `Order ${event.orderNumber} cancelled`,
      `Order ${event.orderNumber} was cancelled. Reason: ${event.reason}`,
    );
    await this.notifications.sendAdmin({
      eventName: event.name,
      eventId: event.orderId,
      subject: 'Order cancelled',
      body: `Order ${event.orderNumber} was cancelled.`,
      metadata: { orderId: event.orderId, severity: 'warning' },
    });
  }

  private async handlePayment(event: PaymentDomainEvent): Promise<void> {
    const order = await this.ordersService.getNotificationOrder(event.orderId);
    const messages = {
      PaymentStarted: `Payment started for order ${order.orderNumber}.`,
      PaymentSucceeded: `Payment succeeded for order ${order.orderNumber}.`,
      PaymentFailed: `Payment failed for order ${order.orderNumber}. Please try again.`,
      RefundCompleted: `A refund was completed for order ${order.orderNumber}.`,
    } as const;
    const body = messages[event.name];
    await this.notifyCustomer(
      event.name,
      event.paymentAttemptId,
      order,
      `${event.name.replaceAll(/([A-Z])/g, ' $1').trim()}: ${order.orderNumber}`,
      body,
    );
    await this.notifications.sendAdmin({
      eventName: event.name,
      eventId: event.paymentAttemptId,
      subject: event.name,
      body,
      metadata: {
        orderId: event.orderId,
        paymentAttemptId: event.paymentAttemptId,
        severity: event.name === 'PaymentFailed' ? 'warning' : 'info',
      },
    });
  }

  private async handleShipment(event: ShipmentDomainEvent): Promise<void> {
    const order = await this.ordersService.getNotificationOrder(event.orderId);
    const body =
      event.name === 'ShipmentCreated'
        ? `Shipment created for order ${order.orderNumber}.${event.trackingCode ? ` Tracking: ${event.trackingCode}.` : ''}`
        : `Order ${order.orderNumber} was delivered.`;
    await this.notifyCustomer(
      event.name,
      event.shipmentId,
      order,
      event.name === 'ShipmentCreated' ? 'Shipment created' : 'Shipment delivered',
      body,
    );
    await this.notifications.sendAdmin({
      eventName: event.name,
      eventId: event.shipmentId,
      subject: event.name,
      body,
      metadata: { orderId: event.orderId, shipmentId: event.shipmentId, severity: 'info' },
    });
  }

  private async handleAuth(event: AuthDomainEvent): Promise<void> {
    await this.backgroundJobs.add(BackgroundJobName.EMAIL_DELIVERY, {
      eventName: event.name,
      eventId: event.passwordResetTokenId,
      recipient: event.email,
      subject: 'Password reset requested',
      body: 'Password reset instructions were sent. Request a new reset if they expire.',
      deliveryBody: `Use this token to reset your password: ${event.resetToken}. It expires at ${event.expiresAt.toISOString()}.`,
      metadata: { staffUserId: event.staffUserId },
    });
  }

  private async handleCustomer(event: CustomerDomainEvent): Promise<void> {
    const eventId = event.customerId;
    const deliveries: Promise<unknown>[] = [
      this.backgroundJobs.add(BackgroundJobName.EMAIL_DELIVERY, {
        eventName: event.name,
        eventId,
        recipient: event.email,
        subject: 'Welcome',
        body: `Welcome, ${event.customerName}. Your customer account is ready.`,
        metadata: { customerId: event.customerId },
      }),
      this.notifications.sendAdmin({
        eventName: event.name,
        eventId,
        subject: 'Customer registered',
        body: `${event.customerName} registered a customer account.`,
        metadata: { customerId: event.customerId, severity: 'info' },
      }),
    ];
    if (event.phone) {
      deliveries.push(
        this.backgroundJobs.add(BackgroundJobName.SMS_DELIVERY, {
          eventName: event.name,
          eventId,
          recipient: event.phone,
          body: `Welcome, ${event.customerName}. Your customer account is ready.`,
          metadata: { customerId: event.customerId },
        }),
      );
    }
    await Promise.all(deliveries);
  }

  private async handleInventory(event: InventoryDomainEvent): Promise<void> {
    await this.notifications.sendAdmin({
      eventName: event.name,
      eventId: event.eventId,
      subject: 'Low inventory',
      body: `Variant ${event.variantId} has ${event.availableStock} available (threshold ${event.lowStockThreshold}).`,
      metadata: {
        inventoryItemId: event.inventoryItemId,
        variantId: event.variantId,
        severity: 'warning',
      },
    });
  }

  private async notifyCustomer(
    eventName: string,
    eventId: string,
    order: NotificationOrderView,
    subject: string,
    body: string,
  ): Promise<void> {
    const metadata = { orderId: order.id, customerId: order.customerId };
    const deliveries: Promise<unknown>[] = [];
    if (order.customer.email) {
      deliveries.push(
        this.backgroundJobs.add(BackgroundJobName.EMAIL_DELIVERY, {
          eventName,
          eventId,
          recipient: order.customer.email,
          subject,
          body,
          metadata,
        }),
      );
    }
    if (order.customer.phone) {
      deliveries.push(
        this.backgroundJobs.add(BackgroundJobName.SMS_DELIVERY, {
          eventName,
          eventId,
          recipient: order.customer.phone,
          body,
          metadata,
        }),
      );
    }
    await Promise.all(deliveries);
  }
}
