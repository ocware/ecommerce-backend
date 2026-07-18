import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';

import { FeatureEnabledGuard } from './feature-enabled.guard';
import { FEATURE_METADATA_KEY, OptionalFeature } from './feature-toggle';

export function RequireFeature(feature: OptionalFeature) {
  return applyDecorators(
    SetMetadata(FEATURE_METADATA_KEY, feature),
    UseGuards(FeatureEnabledGuard),
  );
}
