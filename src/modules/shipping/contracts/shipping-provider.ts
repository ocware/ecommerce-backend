export enum ShippingProviderName {
  LOCAL = 'LOCAL',
}

export type ShippingAddress = {
  fullName: string;
  phone: string;
  country: string;
  province: string;
  city: string;
  line1: string;
  line2?: string;
  postalCode?: string;
};

export type CalculateShippingRateInput = {
  methodId: string;
  methodType: 'STANDARD' | 'EXPRESS' | 'LOCAL_PICKUP';
  configuredPrice: string;
  freeShippingThreshold: string | null;
  orderSubtotal: string;
  currency: string;
  address: ShippingAddress;
  freeShippingDiscount: boolean;
  estimatedMinDays: number;
  estimatedMaxDays: number;
};

export type ShippingRateResult = {
  price: string;
  discount: string;
  total: string;
  freeShipping: boolean;
  estimatedDeliveryAt: Date;
};

export type CreateProviderShipmentInput = {
  shipmentId: string;
  orderId: string;
  orderNumber: string;
  methodCode: string;
  address: ShippingAddress;
  estimatedDeliveryAt: Date | null;
};

export type ProviderShipmentResult = {
  providerReference: string;
  trackingCode: string | null;
  status: 'CREATED' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED' | 'FAILED';
  estimatedDeliveryAt?: Date;
  metadata?: Record<string, string | number | boolean | null>;
};

export type TrackProviderShipmentInput = {
  providerReference: string;
  trackingCode: string | null;
  currentStatus: ProviderShipmentResult['status'];
};

export interface ShippingProvider {
  readonly name: ShippingProviderName;
  calculateRate(input: CalculateShippingRateInput): Promise<ShippingRateResult>;
  createShipment(input: CreateProviderShipmentInput): Promise<ProviderShipmentResult>;
  cancelShipment(providerReference: string): Promise<ProviderShipmentResult>;
  trackShipment(input: TrackProviderShipmentInput): Promise<ProviderShipmentResult>;
}
