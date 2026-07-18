import { Global, Module } from '@nestjs/common';

import { InternalEventBus } from './internal-event-bus';

@Global()
@Module({
  providers: [InternalEventBus],
  exports: [InternalEventBus],
})
export class EventsModule {}
