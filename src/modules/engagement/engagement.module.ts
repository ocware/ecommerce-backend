import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CustomersModule } from '../customers/customers.module';
import { AdminReviewsController } from './controllers/admin-reviews.controller';
import { PublicReviewsController } from './controllers/public-reviews.controller';
import { StoreEngagementController } from './controllers/store-engagement.controller';
import { EngagementService } from './services/engagement.service';

@Module({
  imports: [AuthModule, CustomersModule],
  controllers: [PublicReviewsController, StoreEngagementController, AdminReviewsController],
  providers: [EngagementService],
  exports: [EngagementService],
})
export class EngagementModule {}
