import { ConfigService } from '@nestjs/config';

import { ShippingProviderName } from '../contracts/shipping-provider';
import { LocalShippingProvider } from '../providers/local-shipping.provider';
import { ShippingProviderRegistry } from './shipping-provider-registry.service';

describe('ShippingProviderRegistry', () => {
  it('rejects providers disabled for the deployment', () => {
    const config = { get: () => [] } as unknown as ConfigService;
    const registry = new ShippingProviderRegistry(config, new LocalShippingProvider());

    expect(() => registry.get(ShippingProviderName.LOCAL)).toThrow(
      'The selected shipping provider is not configured.',
    );
  });
});
