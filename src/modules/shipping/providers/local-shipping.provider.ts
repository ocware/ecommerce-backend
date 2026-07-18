import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  CalculateShippingRateInput,
  CreateProviderShipmentInput,
  ProviderShipmentResult,
  ShippingProvider,
  ShippingProviderName,
  TrackProviderShipmentInput,
} from '../contracts/shipping-provider';

@Injectable()
export class LocalShippingProvider implements ShippingProvider {
  readonly name = ShippingProviderName.LOCAL;

  calculateRate(input: CalculateShippingRateInput) {
    const price = new Prisma.Decimal(input.configuredPrice);
    const threshold = input.freeShippingThreshold
      ? new Prisma.Decimal(input.freeShippingThreshold)
      : null;
    const freeShipping =
      input.methodType === 'LOCAL_PICKUP' ||
      input.freeShippingDiscount ||
      Boolean(threshold?.lessThanOrEqualTo(input.orderSubtotal));
    const discount = freeShipping ? price : new Prisma.Decimal(0);
    return Promise.resolve({
      price: price.toFixed(2),
      discount: discount.toFixed(2),
      total: price.minus(discount).toFixed(2),
      freeShipping,
      estimatedDeliveryAt: this.daysFromNow(input.estimatedMaxDays),
    });
  }

  createShipment(input: CreateProviderShipmentInput) {
    const reference = `local_${randomUUID()}`;
    return Promise.resolve({
      providerReference: reference,
      trackingCode: `LOCAL-${reference.slice(-12).toUpperCase()}`,
      status: 'CREATED' as const,
      estimatedDeliveryAt: input.estimatedDeliveryAt ?? undefined,
      metadata: { localDevelopmentProvider: true },
    });
  }

  cancelShipment(providerReference: string) {
    return Promise.resolve({
      providerReference,
      trackingCode: null,
      status: 'CANCELLED' as const,
    });
  }

  trackShipment(input: TrackProviderShipmentInput): Promise<ProviderShipmentResult> {
    return Promise.resolve({
      providerReference: input.providerReference,
      trackingCode: input.trackingCode,
      status: input.currentStatus,
    });
  }

  private daysFromNow(days: number): Date {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}
