import { InternalEventBus } from './internal-event-bus';

describe('InternalEventBus', () => {
  it('publishes events synchronously and filters typed streams by name', () => {
    const bus = new InternalEventBus();
    const orderEvents: string[] = [];
    const allEvents: string[] = [];
    bus.stream(['OrderCreated']).subscribe((event) => orderEvents.push(event.name));
    bus.stream().subscribe((event) => allEvents.push(event.name));

    bus.publish({ name: 'CustomerRegistered', occurredAt: new Date() });
    bus.publish({ name: 'OrderCreated', occurredAt: new Date() });

    expect(orderEvents).toEqual(['OrderCreated']);
    expect(allEvents).toEqual(['CustomerRegistered', 'OrderCreated']);
  });
});
