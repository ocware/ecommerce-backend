import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

import { InternalEventBus } from '../../../shared/events/internal-event-bus';
import { ShipmentDomainEvent } from '../domain/shipment-events';

@Injectable()
export class ShipmentEventPublisher {
  constructor(private readonly events: InternalEventBus = new InternalEventBus()) {}

  publish(event: ShipmentDomainEvent): void {
    this.events.publish(event);
  }

  stream(): Observable<ShipmentDomainEvent> {
    return this.events.stream<ShipmentDomainEvent>(['ShipmentCreated', 'ShipmentDelivered']);
  }
}
