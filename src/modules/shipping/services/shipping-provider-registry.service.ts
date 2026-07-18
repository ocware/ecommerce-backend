import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ShippingProvider, ShippingProviderName } from '../contracts/shipping-provider';
import { LocalShippingProvider } from '../providers/local-shipping.provider';

@Injectable()
export class ShippingProviderRegistry {
  private readonly providers: Map<ShippingProviderName, ShippingProvider>;

  constructor(config: ConfigService, localProvider: LocalShippingProvider) {
    const enabled = new Set(
      config.get<ShippingProviderName[]>(
        'app.shippingProviders',
        Object.values(ShippingProviderName),
      ),
    );
    this.providers = new Map(
      [localProvider]
        .filter((provider) => enabled.has(provider.name))
        .map((provider) => [provider.name, provider]),
    );
  }

  get(name: string): ShippingProvider {
    const provider = this.providers.get(name as ShippingProviderName);
    if (!provider) {
      throw new BadRequestException({
        code: 'SHIPPING_PROVIDER_NOT_CONFIGURED',
        message: 'The selected shipping provider is not configured.',
      });
    }
    return provider;
  }
}
