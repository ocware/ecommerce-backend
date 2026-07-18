import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

import { InternalEventBus } from '../../../shared/events/internal-event-bus';
import { CustomerDomainEvent } from '../domain/customer-events';

@Injectable()
export class CustomerEventPublisher {
  constructor(private readonly events: InternalEventBus = new InternalEventBus()) {}

  publish(event: CustomerDomainEvent): void {
    this.events.publish(event);
  }

  stream(): Observable<CustomerDomainEvent> {
    return this.events.stream<CustomerDomainEvent>(['CustomerRegistered']);
  }
}
