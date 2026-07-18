import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

import { InternalEventBus } from '../../../shared/events/internal-event-bus';
import { OrderDomainEvent } from '../domain/order-events';

@Injectable()
export class OrderEventPublisher {
  constructor(private readonly events: InternalEventBus = new InternalEventBus()) {}

  publish(event: OrderDomainEvent): void {
    this.events.publish(event);
  }

  stream(): Observable<OrderDomainEvent> {
    return this.events.stream<OrderDomainEvent>(['OrderCreated', 'OrderCancelled']);
  }
}
