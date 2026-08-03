import { BadRequestException } from '@nestjs/common';
import { Prisma, ShopSettings } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ShippingRatesService } from '../../shipping/services/shipping-rates.service';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  const settings: ShopSettings = {
    id: 'default',
    shopName: 'Example Store',
    shopActive: true,
    contactPhone: null,
    contactEmail: null,
    address: null,
    footerText: null,
    currency: 'USD',
    taxEnabled: false,
    taxRate: new Prisma.Decimal(0),
    defaultShippingMethodId: null,
    orderPrefix: 'ORD',
    lowStockThreshold: 3,
    guestCheckoutEnabled: true,
    returnsEnabled: true,
    returnWindowDays: 7,
    version: 0,
    updatedByStaffUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const prisma = {
    shopSettings: {
      findUnique: jest.fn(() => settings),
      create: jest.fn(() => settings),
      update: jest.fn((input: { data: Partial<ShopSettings> }) => ({
        ...settings,
        ...input.data,
        taxRate:
          input.data.taxRate instanceof Prisma.Decimal ? input.data.taxRate : settings.taxRate,
      })),
    },
  };
  const shipping = {
    getMethodReference: jest.fn(() =>
      Promise.resolve({
        id: '11111111-1111-4111-8111-111111111111',
        code: 'standard',
        currency: 'USD',
        isActive: true,
      }),
    ),
  };
  const service = new SettingsService(
    prisma as unknown as PrismaService,
    shipping as unknown as ShippingRatesService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns typed database-backed storefront settings', async () => {
    await expect(service.get()).resolves.toEqual({
      shopName: 'Example Store',
      shopActive: true,
      contactPhone: null,
      contactEmail: null,
      address: null,
      footerText: null,
      currency: 'USD',
      taxEnabled: false,
      taxRate: '0.0000',
      defaultShippingMethodId: null,
      orderPrefix: 'ORD',
      lowStockThreshold: 3,
      guestCheckoutEnabled: true,
      returnsEnabled: true,
      returnWindowDays: 7,
    });
  });

  it('validates and updates all editable shop behavior together', async () => {
    const methodId = '11111111-1111-4111-8111-111111111111';

    const result = await service.update(
      {
        shopName: 'Northwind',
        currency: 'USD',
        taxEnabled: true,
        taxRate: 8.25,
        defaultShippingMethodId: methodId,
        orderPrefix: 'NW',
        lowStockThreshold: 5,
        guestCheckoutEnabled: false,
      },
      'staff-id',
    );

    expect(shipping.getMethodReference).toHaveBeenCalledWith(methodId);
    expect(prisma.shopSettings.update).toHaveBeenCalledWith({
      where: { id: 'default' },
      data: expect.objectContaining({
        shopName: 'Northwind',
        taxEnabled: true,
        orderPrefix: 'NW',
        lowStockThreshold: 5,
        guestCheckoutEnabled: false,
        updatedByStaffUserId: 'staff-id',
      }) as Record<string, unknown>,
    });
    expect(result.taxRate).toBe('8.2500');
  });

  it('rejects a default shipping method using another currency', async () => {
    shipping.getMethodReference.mockResolvedValueOnce({
      id: '11111111-1111-4111-8111-111111111111',
      code: 'standard',
      currency: 'EUR',
      isActive: true,
    });

    await expect(
      service.update(
        { defaultShippingMethodId: '11111111-1111-4111-8111-111111111111' },
        'staff-id',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
