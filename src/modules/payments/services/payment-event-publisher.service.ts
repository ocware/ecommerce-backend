import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

import { PaymentDomainEvent } from '../domain/payment-events';

@Injectable()
export class PaymentEventPublisher {
  private readonly events = new Subject<PaymentDomainEvent>();

  publish(event: PaymentDomainEvent): void {
    this.events.next(event);
  }

  stream(): Observable<PaymentDomainEvent> {
    return this.events.asObservable();
  }
}
