import { BadRequestException, Injectable } from '@nestjs/common';

import { ShippingProvider, ShippingProviderName } from '../contracts/shipping-provider';
import { LocalShippingProvider } from '../providers/local-shipping.provider';

@Injectable()
export class ShippingProviderRegistry {
  private readonly providers: Map<ShippingProviderName, ShippingProvider>;

  constructor(localProvider: LocalShippingProvider) {
    this.providers = new Map([[localProvider.name, localProvider]]);
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
