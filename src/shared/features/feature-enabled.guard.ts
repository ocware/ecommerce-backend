import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { FEATURE_METADATA_KEY, OptionalFeature } from './feature-toggle';
import { FeatureToggleService } from './feature-toggle.service';

@Injectable()
export class FeatureEnabledGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly features: FeatureToggleService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const feature = this.reflector.getAllAndOverride<OptionalFeature>(FEATURE_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature || this.features.isEnabled(feature)) return true;

    throw new NotFoundException({
      code: 'FEATURE_DISABLED',
      message: 'This feature is not enabled for this deployment.',
      details: { feature },
    });
  }
}
