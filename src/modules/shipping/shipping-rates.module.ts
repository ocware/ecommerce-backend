import { Module } from '@nestjs/common';

import { LocalShippingProvider } from './providers/local-shipping.provider';
import { ShippingProviderRegistry } from './services/shipping-provider-registry.service';
import { ShippingRatesService } from './services/shipping-rates.service';

@Module({
  providers: [ShippingRatesService, ShippingProviderRegistry, LocalShippingProvider],
  exports: [ShippingRatesService, ShippingProviderRegistry],
})
export class ShippingRatesModule {}
