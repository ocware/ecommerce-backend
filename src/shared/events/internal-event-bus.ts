import { Injectable } from '@nestjs/common';
import { filter, Observable, Subject } from 'rxjs';

export type InternalDomainEvent = {
  name: string;
  occurredAt: Date;
};

@Injectable()
export class InternalEventBus {
  private readonly events = new Subject<InternalDomainEvent>();

  publish<T extends InternalDomainEvent>(event: T): void {
    this.events.next(event);
  }

  stream<T extends InternalDomainEvent>(eventNames?: readonly T['name'][]): Observable<T> {
    return this.events
      .asObservable()
      .pipe(
        filter((event): event is T => !eventNames || eventNames.includes(event.name as T['name'])),
      );
  }
}
