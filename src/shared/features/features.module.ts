import { Global, Module } from '@nestjs/common';

import { FeatureEnabledGuard } from './feature-enabled.guard';
import { FeatureToggleService } from './feature-toggle.service';

@Global()
@Module({
  providers: [FeatureToggleService, FeatureEnabledGuard],
  exports: [FeatureToggleService, FeatureEnabledGuard],
})
export class FeaturesModule {}
