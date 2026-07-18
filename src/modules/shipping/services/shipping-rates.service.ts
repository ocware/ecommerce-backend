import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ShippingMethodType } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ShippingAddress } from '../contracts/shipping-provider';
import { CreateShippingMethodDto } from '../dto/create-shipping-method.dto';
import { CreateShippingZoneDto } from '../dto/create-shipping-zone.dto';
import { ShippingQuoteDto } from '../dto/shipping-quote.dto';
import { UpdateShippingMethodDto } from '../dto/update-shipping-method.dto';
import { UpdateShippingZoneDto } from '../dto/update-shipping-zone.dto';
import { UpsertShippingRateDto } from '../dto/upsert-shipping-rate.dto';
import { ShippingProviderRegistry } from './shipping-provider-registry.service';

const methodInclude = Prisma.validator<Prisma.ShippingMethodInclude>()({
  rates: {
    include: { shippingZone: true },
  },
});
type MethodWithRates = Prisma.ShippingMethodGetPayload<{ include: typeof methodInclude }>;

export type CheckoutShippingQuote = {
  methodId: string;
  code: string;
  name: string;
  type: ShippingMethodType;
  provider: string;
  currency: string;
  price: string;
  discount: string;
  total: string;
  freeShipping: boolean;
  estimatedDeliveryAt: Date;
  estimatedMinDays: number;
  estimatedMaxDays: number;
  pickupInstructions: string | null;
  pickupAddress: Prisma.JsonValue | null;
};

@Injectable()
export class ShippingRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: ShippingProviderRegistry,
  ) {}

  async createMethod(dto: CreateShippingMethodDto) {
    this.providerRegistry.get(dto.provider);
    this.validateMethodDays(dto.estimatedMinDays, dto.estimatedMaxDays);
    this.validatePickup(dto.type, dto.pickupAddress);
    try {
      const method = await this.prisma.shippingMethod.create({
        data: {
          ...dto,
          code: dto.code.toLowerCase(),
          defaultPrice: new Prisma.Decimal(dto.defaultPrice),
          freeShippingThreshold: dto.freeShippingThreshold
            ? new Prisma.Decimal(dto.freeShippingThreshold)
            : undefined,
          pickupAddress: dto.pickupAddress as Prisma.InputJsonObject | undefined,
        },
        include: methodInclude,
      });
      return this.serializeMethod(method);
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new ConflictException({
          code: 'SHIPPING_METHOD_CODE_EXISTS',
          message: 'A shipping method with this code already exists.',
        });
      }
      throw error;
    }
  }

  async updateMethod(id: string, dto: UpdateShippingMethodDto) {
    const current = await this.requireMethod(id);
    if (dto.provider) this.providerRegistry.get(dto.provider);
    this.validateMethodDays(
      dto.estimatedMinDays ?? current.estimatedMinDays,
      dto.estimatedMaxDays ?? current.estimatedMaxDays,
    );
    this.validatePickup(dto.type ?? current.type, dto.pickupAddress ?? current.pickupAddress);
    const method = await this.prisma.shippingMethod.update({
      where: { id },
      data: {
        code: dto.code?.toLowerCase(),
        name: dto.name,
        description: dto.description,
        provider: dto.provider,
        type: dto.type,
        currency: dto.currency,
        defaultPrice: dto.defaultPrice ? new Prisma.Decimal(dto.defaultPrice) : undefined,
        freeShippingThreshold: dto.freeShippingThreshold
          ? new Prisma.Decimal(dto.freeShippingThreshold)
          : undefined,
        estimatedMinDays: dto.estimatedMinDays,
        estimatedMaxDays: dto.estimatedMaxDays,
        pickupInstructions: dto.pickupInstructions,
        pickupAddress: dto.pickupAddress
          ? (dto.pickupAddress as Prisma.InputJsonObject)
          : undefined,
        isActive: dto.isActive,
      },
      include: methodInclude,
    });
    return this.serializeMethod(method);
  }

  async listMethods(admin = false) {
    const methods = await this.prisma.shippingMethod.findMany({
      where: admin ? undefined : { isActive: true },
      include: methodInclude,
      orderBy: { name: 'asc' },
    });
    return methods.map((method) => this.serializeMethod(method));
  }

  async getMethodReference(id: string) {
    const method = await this.requireMethod(id);
    return {
      id: method.id,
      code: method.code,
      currency: method.currency,
      isActive: method.isActive,
    };
  }

  async createZone(dto: CreateShippingZoneDto) {
    return this.prisma.shippingZone.create({
      data: {
        name: dto.name,
        countries: this.normalizeRegions(dto.countries),
        provinces: this.normalizeRegions(dto.provinces ?? []),
        priority: dto.priority,
        isActive: dto.isActive,
      },
    });
  }

  async updateZone(id: string, dto: UpdateShippingZoneDto) {
    await this.requireZone(id);
    return this.prisma.shippingZone.update({
      where: { id },
      data: {
        name: dto.name,
        countries: dto.countries ? this.normalizeRegions(dto.countries) : undefined,
        provinces: dto.provinces ? this.normalizeRegions(dto.provinces) : undefined,
        priority: dto.priority,
        isActive: dto.isActive,
      },
    });
  }

  listZones() {
    return this.prisma.shippingZone.findMany({
      include: { rates: true },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    });
  }

  async upsertRate(methodId: string, zoneId: string, dto: UpsertShippingRateDto) {
    const [method] = await Promise.all([this.requireMethod(methodId), this.requireZone(zoneId)]);
    const minimum = dto.minimumOrderAmount ? new Prisma.Decimal(dto.minimumOrderAmount) : null;
    const maximum = dto.maximumOrderAmount ? new Prisma.Decimal(dto.maximumOrderAmount) : null;
    if (minimum && maximum && minimum.greaterThan(maximum)) {
      throw new ConflictException({
        code: 'INVALID_SHIPPING_RATE_RANGE',
        message: 'The minimum order amount cannot exceed the maximum order amount.',
      });
    }
    const rate = await this.prisma.shippingRate.upsert({
      where: {
        shippingMethodId_shippingZoneId: { shippingMethodId: methodId, shippingZoneId: zoneId },
      },
      create: {
        shippingMethodId: methodId,
        shippingZoneId: zoneId,
        price: new Prisma.Decimal(dto.price),
        freeShippingThreshold: dto.freeShippingThreshold
          ? new Prisma.Decimal(dto.freeShippingThreshold)
          : undefined,
        minimumOrderAmount: minimum,
        maximumOrderAmount: maximum,
        isActive: dto.isActive,
      },
      update: {
        price: new Prisma.Decimal(dto.price),
        freeShippingThreshold: dto.freeShippingThreshold
          ? new Prisma.Decimal(dto.freeShippingThreshold)
          : null,
        minimumOrderAmount: minimum,
        maximumOrderAmount: maximum,
        isActive: dto.isActive,
      },
    });
    return {
      ...rate,
      price: rate.price.toFixed(2),
      freeShippingThreshold: rate.freeShippingThreshold?.toFixed(2) ?? null,
      minimumOrderAmount: rate.minimumOrderAmount?.toFixed(2) ?? null,
      maximumOrderAmount: rate.maximumOrderAmount?.toFixed(2) ?? null,
      currency: method.currency,
    };
  }

  async getAvailableRates(dto: ShippingQuoteDto): Promise<CheckoutShippingQuote[]> {
    const methods = await this.prisma.shippingMethod.findMany({
      where: { isActive: true, currency: dto.currency },
      include: methodInclude,
      orderBy: { name: 'asc' },
    });
    const quotes = await Promise.all(
      methods.map((method) =>
        this.calculateMethodQuote(
          method,
          dto.address,
          dto.orderSubtotal,
          dto.currency,
          dto.freeShippingDiscount ?? false,
          false,
        ),
      ),
    );
    return quotes.filter((quote): quote is CheckoutShippingQuote => quote !== null);
  }

  async quoteForCheckout(
    methodId: string,
    address: ShippingAddress,
    orderSubtotal: string,
    currency: string,
    freeShippingDiscount: boolean,
  ): Promise<CheckoutShippingQuote> {
    const method = await this.requireMethod(methodId);
    const quote = await this.calculateMethodQuote(
      method,
      address,
      orderSubtotal,
      currency,
      freeShippingDiscount,
      true,
    );
    if (!quote) {
      throw new NotFoundException({
        code: 'SHIPPING_METHOD_UNAVAILABLE',
        message: 'The selected shipping method is unavailable for this address or order total.',
      });
    }
    return quote;
  }

  private async calculateMethodQuote(
    method: MethodWithRates,
    address: ShippingAddress,
    orderSubtotal: string,
    currency: string,
    freeShippingDiscount: boolean,
    strict: boolean,
  ): Promise<CheckoutShippingQuote | null> {
    if (!method.isActive || method.currency !== currency) {
      if (strict) {
        throw new ConflictException({
          code: 'SHIPPING_METHOD_CURRENCY_MISMATCH',
          message: 'The selected shipping method does not support this currency.',
        });
      }
      return null;
    }
    const matchingRates = method.rates
      .filter((rate) => rate.isActive && rate.shippingZone.isActive)
      .filter((rate) => this.zoneMatches(rate.shippingZone, address))
      .filter((rate) => this.orderAmountMatches(rate, orderSubtotal))
      .sort((left, right) => right.shippingZone.priority - left.shippingZone.priority);
    if (method.rates.length && !matchingRates.length) return null;
    const rate = matchingRates[0];
    const providerResult = await this.providerRegistry.get(method.provider).calculateRate({
      methodId: method.id,
      methodType: method.type,
      configuredPrice: (rate?.price ?? method.defaultPrice).toFixed(2),
      freeShippingThreshold:
        rate?.freeShippingThreshold?.toFixed(2) ?? method.freeShippingThreshold?.toFixed(2) ?? null,
      orderSubtotal,
      currency,
      address,
      freeShippingDiscount,
      estimatedMinDays: method.estimatedMinDays,
      estimatedMaxDays: method.estimatedMaxDays,
    });
    return {
      methodId: method.id,
      code: method.code,
      name: method.name,
      type: method.type,
      provider: method.provider,
      currency,
      ...providerResult,
      estimatedMinDays: method.estimatedMinDays,
      estimatedMaxDays: method.estimatedMaxDays,
      pickupInstructions: method.pickupInstructions,
      pickupAddress: method.pickupAddress,
    };
  }

  private zoneMatches(
    zone: { countries: string[]; provinces: string[] },
    address: ShippingAddress,
  ): boolean {
    const country = address.country.trim().toUpperCase();
    const province = address.province.trim().toUpperCase();
    return (
      zone.countries.includes(country) &&
      (!zone.provinces.length || zone.provinces.includes(province))
    );
  }

  private orderAmountMatches(
    rate: { minimumOrderAmount: Prisma.Decimal | null; maximumOrderAmount: Prisma.Decimal | null },
    subtotal: string,
  ): boolean {
    const amount = new Prisma.Decimal(subtotal);
    return (
      (!rate.minimumOrderAmount || amount.greaterThanOrEqualTo(rate.minimumOrderAmount)) &&
      (!rate.maximumOrderAmount || amount.lessThanOrEqualTo(rate.maximumOrderAmount))
    );
  }

  private async requireMethod(id: string): Promise<MethodWithRates> {
    const method = await this.prisma.shippingMethod.findUnique({
      where: { id },
      include: methodInclude,
    });
    if (!method) {
      throw new NotFoundException({
        code: 'SHIPPING_METHOD_NOT_FOUND',
        message: 'Shipping method was not found.',
      });
    }
    return method;
  }

  private async requireZone(id: string) {
    const zone = await this.prisma.shippingZone.findUnique({ where: { id } });
    if (!zone) {
      throw new NotFoundException({
        code: 'SHIPPING_ZONE_NOT_FOUND',
        message: 'Shipping zone was not found.',
      });
    }
    return zone;
  }

  private serializeMethod(method: MethodWithRates) {
    return {
      ...method,
      defaultPrice: method.defaultPrice.toFixed(2),
      freeShippingThreshold: method.freeShippingThreshold?.toFixed(2) ?? null,
      rates: method.rates.map((rate) => ({
        ...rate,
        price: rate.price.toFixed(2),
        freeShippingThreshold: rate.freeShippingThreshold?.toFixed(2) ?? null,
        minimumOrderAmount: rate.minimumOrderAmount?.toFixed(2) ?? null,
        maximumOrderAmount: rate.maximumOrderAmount?.toFixed(2) ?? null,
      })),
    };
  }

  private normalizeRegions(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean))];
  }

  private validateMethodDays(minimum: number, maximum: number): void {
    if (minimum > maximum) {
      throw new ConflictException({
        code: 'INVALID_DELIVERY_ESTIMATE',
        message: 'Minimum delivery days cannot exceed maximum delivery days.',
      });
    }
  }

  private validatePickup(type: ShippingMethodType, pickupAddress: unknown): void {
    if (type === ShippingMethodType.LOCAL_PICKUP && !pickupAddress) {
      throw new ConflictException({
        code: 'PICKUP_ADDRESS_REQUIRED',
        message: 'Local pickup methods require a pickup address.',
      });
    }
  }

  private isUniqueConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
