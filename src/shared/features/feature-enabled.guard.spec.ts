import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { FeatureEnabledGuard } from './feature-enabled.guard';
import { OptionalFeature } from './feature-toggle';
import { FeatureToggleService } from './feature-toggle.service';

describe('FeatureEnabledGuard', () => {
  it('returns a structured not-found error for a disabled optional API', () => {
    const isEnabled = jest.fn(() => false);
    const reflector = {
      getAllAndOverride: jest.fn(() => OptionalFeature.REPORTS),
    } as unknown as Reflector;
    const features = {
      isEnabled,
    } as unknown as FeatureToggleService;
    const guard = new FeatureEnabledGuard(reflector, features);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(NotFoundException);
    expect(isEnabled).toHaveBeenCalledWith(OptionalFeature.REPORTS);
  });
});
