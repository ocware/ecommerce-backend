import { ShippingMethodType, Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ShippingProviderName } from '../contracts/shipping-provider';
import { LocalShippingProvider } from '../providers/local-shipping.provider';
import { ShippingProviderRegistry } from './shipping-provider-registry.service';
import { ShippingRatesService } from './shipping-rates.service';

describe('ShippingRatesService', () => {
  const now = new Date();
  const zone = {
    id: 'zone-id',
    name: 'California',
    countries: ['US'],
    provinces: ['CA'],
    isActive: true,
    priority: 10,
    createdAt: now,
    updatedAt: now,
  };
  const method = {
    id: 'method-id',
    code: 'standard',
    name: 'Standard delivery',
    description: null,
    provider: ShippingProviderName.LOCAL,
    type: ShippingMethodType.STANDARD,
    currency: 'USD',
    defaultPrice: new Prisma.Decimal('12.00'),
    freeShippingThreshold: null,
    estimatedMinDays: 2,
    estimatedMaxDays: 4,
    pickupInstructions: null,
    pickupAddress: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    rates: [
      {
        id: 'rate-id',
        shippingMethodId: 'method-id',
        shippingZoneId: 'zone-id',
        price: new Prisma.Decimal('8.00'),
        freeShippingThreshold: new Prisma.Decimal('75.00'),
        minimumOrderAmount: null,
        maximumOrderAmount: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        shippingZone: zone,
      },
    ],
  };
  const prisma = {
    shippingMethod: {
      findMany: jest.fn(() => [method]),
      findUnique: jest.fn(() => method),
    },
  };
  const registry = new ShippingProviderRegistry(new LocalShippingProvider());
  const service = new ShippingRatesService(prisma as unknown as PrismaService, registry);
  const address = {
    fullName: 'Customer',
    phone: '+12025550123',
    country: 'us',
    province: 'ca',
    city: 'Los Angeles',
    line1: '1 Test Street',
  };

  beforeEach(() => jest.clearAllMocks());

  it('uses the most specific active zone price and threshold-based free shipping', async () => {
    const [quote] = await service.getAvailableRates({
      address,
      orderSubtotal: '80.00',
      currency: 'USD',
    });

    expect(quote).toMatchObject({
      methodId: method.id,
      price: '8.00',
      discount: '8.00',
      total: '0.00',
      freeShipping: true,
      estimatedMinDays: 2,
      estimatedMaxDays: 4,
    });
  });

  it('applies checkout free-shipping discounts without changing the configured price snapshot', async () => {
    const quote = await service.quoteForCheckout(method.id, address, '20.00', 'USD', true);

    expect(quote.price).toBe('8.00');
    expect(quote.discount).toBe('8.00');
    expect(quote.total).toBe('0.00');
  });

  it('always quotes local pickup without a shipping charge', async () => {
    const quote = await registry.get(ShippingProviderName.LOCAL).calculateRate({
      methodId: 'pickup-method-id',
      methodType: ShippingMethodType.LOCAL_PICKUP,
      configuredPrice: '5.00',
      freeShippingThreshold: null,
      orderSubtotal: '10.00',
      currency: 'USD',
      address,
      freeShippingDiscount: false,
      estimatedMinDays: 0,
      estimatedMaxDays: 1,
    });

    expect(quote).toMatchObject({ price: '5.00', discount: '5.00', total: '0.00' });
  });
});
