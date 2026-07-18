import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

import { ShipmentDomainEvent } from '../domain/shipment-events';

@Injectable()
export class ShipmentEventPublisher {
  private readonly events = new Subject<ShipmentDomainEvent>();

  publish(event: ShipmentDomainEvent): void {
    this.events.next(event);
  }

  stream(): Observable<ShipmentDomainEvent> {
    return this.events.asObservable();
  }
}
