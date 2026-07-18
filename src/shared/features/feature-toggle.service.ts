import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { OptionalFeature } from './feature-toggle';

@Injectable()
export class FeatureToggleService {
  constructor(private readonly config: ConfigService) {}

  isEnabled(feature: OptionalFeature): boolean {
    return this.config.get<boolean>(`app.features.${feature}`, true);
  }
}
