import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

import { CustomerDomainEvent } from '../domain/customer-events';

@Injectable()
export class CustomerEventPublisher {
  private readonly events = new Subject<CustomerDomainEvent>();

  publish(event: CustomerDomainEvent): void {
    this.events.next(event);
  }

  stream(): Observable<CustomerDomainEvent> {
    return this.events.asObservable();
  }
}
