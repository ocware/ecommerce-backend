import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

import { OrderDomainEvent } from '../domain/order-events';

@Injectable()
export class OrderEventPublisher {
  private readonly events = new Subject<OrderDomainEvent>();

  publish(event: OrderDomainEvent): void {
    this.events.next(event);
  }

  stream(): Observable<OrderDomainEvent> {
    return this.events.asObservable();
  }
}
