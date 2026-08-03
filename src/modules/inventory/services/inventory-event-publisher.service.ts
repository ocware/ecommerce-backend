import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

import { InternalEventBus } from '../../../shared/events/internal-event-bus';
import { InventoryDomainEvent } from '../domain/inventory-events';

@Injectable()
export class InventoryEventPublisher {
  constructor(private readonly events: InternalEventBus = new InternalEventBus()) {}

  publish(event: InventoryDomainEvent): void {
    this.events.publish(event);
  }

  stream(): Observable<InventoryDomainEvent> {
    return this.events.stream<InventoryDomainEvent>(['InventoryLow', 'InventoryRestocked']);
  }
}
