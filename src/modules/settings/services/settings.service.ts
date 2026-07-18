import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, ShopSettings } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ShippingRatesService } from '../../shipping/services/shipping-rates.service';
import { UpdateShopSettingsDto } from '../dto/update-shop-settings.dto';

const settingsId = 'default';
const settingsDefaults = {
  shopName: 'Example Store',
  currency: 'IRR',
  taxEnabled: false,
  taxRate: new Prisma.Decimal(0),
  orderPrefix: 'ORD',
  lowStockThreshold: 0,
  guestCheckoutEnabled: true,
};

export type StorefrontSettings = {
  shopName: string;
  currency: string;
  taxEnabled: boolean;
  taxRate: string;
  defaultShippingMethodId: string | null;
  orderPrefix: string;
  lowStockThreshold: number;
  guestCheckoutEnabled: boolean;
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shippingRatesService: ShippingRatesService,
  ) {}

  async get(): Promise<StorefrontSettings> {
    return this.serialize(await this.getRecord());
  }

  async getAdmin() {
    const settings = await this.getRecord();
    return {
      ...this.serialize(settings),
      version: settings.version,
      updatedByStaffUserId: settings.updatedByStaffUserId,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }

  async update(dto: UpdateShopSettingsDto, staffUserId: string) {
    const current = await this.getRecord();
    const currency = dto.currency ?? current.currency;
    const defaultShippingMethodId =
      dto.defaultShippingMethodId !== undefined
        ? dto.defaultShippingMethodId
        : current.defaultShippingMethodId;

    if (defaultShippingMethodId) {
      const method = await this.shippingRatesService.getMethodReference(defaultShippingMethodId);
      if (!method.isActive || method.currency !== currency) {
        throw new BadRequestException({
          code: 'INVALID_DEFAULT_SHIPPING_METHOD',
          message: 'The default shipping method must be active and use the shop currency.',
          details: { defaultShippingMethodId, currency },
        });
      }
    }

    const updated = await this.prisma.shopSettings.update({
      where: { id: settingsId },
      data: {
        shopName: dto.shopName?.trim(),
        currency: dto.currency,
        taxEnabled: dto.taxEnabled,
        taxRate: dto.taxRate !== undefined ? new Prisma.Decimal(dto.taxRate) : undefined,
        defaultShippingMethodId: dto.defaultShippingMethodId,
        orderPrefix: dto.orderPrefix,
        lowStockThreshold: dto.lowStockThreshold,
        guestCheckoutEnabled: dto.guestCheckoutEnabled,
        updatedByStaffUserId: staffUserId,
        version: { increment: 1 },
      },
    });
    return this.serialize(updated);
  }

  private async getRecord(): Promise<ShopSettings> {
    const settings = await this.prisma.shopSettings.findUnique({ where: { id: settingsId } });
    if (settings) return settings;
    return this.prisma.shopSettings.create({
      data: { id: settingsId, ...settingsDefaults },
    });
  }

  private serialize(settings: ShopSettings): StorefrontSettings {
    return {
      shopName: settings.shopName,
      currency: settings.currency,
      taxEnabled: settings.taxEnabled,
      taxRate: settings.taxRate.toFixed(4),
      defaultShippingMethodId: settings.defaultShippingMethodId,
      orderPrefix: settings.orderPrefix,
      lowStockThreshold: settings.lowStockThreshold,
      guestCheckoutEnabled: settings.guestCheckoutEnabled,
    };
  }
}
