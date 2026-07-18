import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

import { InternalEventBus } from '../../../shared/events/internal-event-bus';
import { AuthDomainEvent } from '../domain/auth-events';

@Injectable()
export class AuthEventPublisher {
  constructor(private readonly events: InternalEventBus = new InternalEventBus()) {}

  publish(event: AuthDomainEvent): void {
    this.events.publish(event);
  }

  stream(): Observable<AuthDomainEvent> {
    return this.events.stream<AuthDomainEvent>(['PasswordResetRequested']);
  }
}
