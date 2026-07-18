import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

import { AuthDomainEvent } from '../domain/auth-events';

@Injectable()
export class AuthEventPublisher {
  private readonly events = new Subject<AuthDomainEvent>();

  publish(event: AuthDomainEvent): void {
    this.events.next(event);
  }

  stream(): Observable<AuthDomainEvent> {
    return this.events.asObservable();
  }
}
