import { Global, Module } from '@nestjs/common';

import { BackgroundJobQueue } from './background-job-queue.service';

@Global()
@Module({
  providers: [BackgroundJobQueue],
  exports: [BackgroundJobQueue],
})
export class BackgroundQueueModule {}
