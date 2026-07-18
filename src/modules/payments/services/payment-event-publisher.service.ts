import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

import { InternalEventBus } from '../../../shared/events/internal-event-bus';
import { PaymentDomainEvent } from '../domain/payment-events';

@Injectable()
export class PaymentEventPublisher {
  constructor(private readonly events: InternalEventBus = new InternalEventBus()) {}

  publish(event: PaymentDomainEvent): void {
    this.events.publish(event);
  }

  stream(): Observable<PaymentDomainEvent> {
    return this.events.stream<PaymentDomainEvent>([
      'PaymentStarted',
      'PaymentSucceeded',
      'PaymentFailed',
      'RefundCompleted',
    ]);
  }
}
