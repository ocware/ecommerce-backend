import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

import { InventoryDomainEvent } from '../domain/inventory-events';

@Injectable()
export class InventoryEventPublisher {
  private readonly events = new Subject<InventoryDomainEvent>();

  publish(event: InventoryDomainEvent): void {
    this.events.next(event);
  }

  stream(): Observable<InventoryDomainEvent> {
    return this.events.asObservable();
  }
}
