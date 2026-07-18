import { ConfigService } from '@nestjs/config';

import { OptionalFeature } from './feature-toggle';
import { FeatureToggleService } from './feature-toggle.service';

describe('FeatureToggleService', () => {
  it('enables optional features by default and honors deployment overrides', () => {
    const config = {
      get: jest.fn((key: string, fallback: unknown) =>
        key === 'app.features.reports' ? false : fallback,
      ),
    } as unknown as ConfigService;
    const service = new FeatureToggleService(config);

    expect(service.isEnabled(OptionalFeature.MEDIA)).toBe(true);
    expect(service.isEnabled(OptionalFeature.REPORTS)).toBe(false);
  });
});
