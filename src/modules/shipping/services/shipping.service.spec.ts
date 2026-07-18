import {
  OrderFulfillmentStatus,
  OrderPaymentStatus,
  OrderStatus,
  ShipmentStatus,
  ShippingMethodType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { OrdersService, ShippingOrderView } from '../../orders/services/orders.service';
import { ShippingProviderName } from '../contracts/shipping-provider';
import { LocalShippingProvider } from '../providers/local-shipping.provider';
import { ShipmentEventPublisher } from './shipment-event-publisher.service';
import { ShippingProviderRegistry } from './shipping-provider-registry.service';
import { ShippingService } from './shipping.service';

describe('ShippingService shipment lifecycle', () => {
  const now = new Date();
  const order: ShippingOrderView = {
    id: '11111111-1111-4111-8111-111111111111',
    orderNumber: 'ORD-1',
    cartId: '22222222-2222-4222-8222-222222222222',
    customerId: 'customer-id',
    status: OrderStatus.CONFIRMED,
    paymentStatus: OrderPaymentStatus.PAID,
    fulfillmentStatus: OrderFulfillmentStatus.UNFULFILLED,
    currency: 'USD',
    shippingCost: '8.00',
    shippingMethodId: '33333333-3333-4333-8333-333333333333',
    shippingMethod: {
      estimatedDeliveryAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    },
    shippingAddress: {
      fullName: 'Customer',
      phone: '+12025550123',
      country: 'US',
      province: 'CA',
      city: 'Los Angeles',
      line1: '1 Test Street',
    },
  };
  const method = {
    id: order.shippingMethodId!,
    code: 'standard',
    name: 'Standard delivery',
    description: null,
    provider: ShippingProviderName.LOCAL,
    type: ShippingMethodType.STANDARD,
    currency: 'USD',
    defaultPrice: new Prisma.Decimal('8.00'),
    freeShippingThreshold: null,
    estimatedMinDays: 2,
    estimatedMaxDays: 4,
    pickupInstructions: null,
    pickupAddress: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const history: Array<{
    id: string;
    shipmentId: string;
    status: ShipmentStatus;
    description: string | null;
    metadata: null;
    occurredAt: Date;
    createdAt: Date;
  }> = [];
  let currentShipmentStatus: ShipmentStatus = ShipmentStatus.PENDING;
  const shipment = {
    id: '44444444-4444-4444-8444-444444444444',
    orderId: order.id,
    shippingMethodId: method.id,
    provider: method.provider,
    providerReference: null as string | null,
    trackingCode: null as string | null,
    get status(): ShipmentStatus {
      return currentShipmentStatus;
    },
    set status(value: ShipmentStatus) {
      currentShipmentStatus = value;
    },
    cost: new Prisma.Decimal('8.00'),
    currency: 'USD',
    addressSnapshot: order.shippingAddress,
    estimatedDeliveryAt: null as Date | null,
    shippedAt: null as Date | null,
    deliveredAt: null as Date | null,
    cancelledAt: null,
    metadata: null,
    createdAt: now,
    updatedAt: now,
    shippingMethod: method,
    statusHistory: history,
  };
  const prisma = {
    shippingMethod: { findUnique: jest.fn(() => method) },
    shipment: {
      findFirst: jest.fn(() => null),
      create: jest.fn(() => shipment),
      findUnique: jest.fn(() => shipment),
      findMany: jest.fn(() => [{ status: shipment.status }]),
      update: jest.fn(
        (input: {
          data: {
            status: ShipmentStatus;
            providerReference?: string;
            trackingCode?: string | null;
            estimatedDeliveryAt?: Date;
            shippedAt?: Date;
            deliveredAt?: Date;
            statusHistory: { create: { status: ShipmentStatus; description?: string } };
          };
        }) => {
          shipment.status = input.data.status;
          shipment.providerReference = input.data.providerReference ?? shipment.providerReference;
          shipment.trackingCode = input.data.trackingCode ?? shipment.trackingCode;
          shipment.estimatedDeliveryAt =
            input.data.estimatedDeliveryAt ?? shipment.estimatedDeliveryAt;
          shipment.shippedAt = input.data.shippedAt ?? shipment.shippedAt;
          shipment.deliveredAt = input.data.deliveredAt ?? shipment.deliveredAt;
          history.push({
            id: `history-${history.length}`,
            shipmentId: shipment.id,
            status: input.data.status,
            description: input.data.statusHistory.create.description ?? null,
            metadata: null,
            occurredAt: new Date(),
            createdAt: new Date(),
          });
          return shipment;
        },
      ),
    },
  };
  const ordersService = {
    getShippingOrderForAdmin: jest.fn(() => Promise.resolve(order)),
    updateFulfillmentStatus: jest.fn(() => Promise.resolve(order)),
  };
  const providerRegistry = new ShippingProviderRegistry(new LocalShippingProvider());
  const eventPublisher = { publish: jest.fn() };
  const service = new ShippingService(
    prisma as unknown as PrismaService,
    ordersService as unknown as OrdersService,
    providerRegistry,
    eventPublisher as unknown as ShipmentEventPublisher,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    currentShipmentStatus = ShipmentStatus.PENDING;
    shipment.providerReference = null;
    shipment.trackingCode = null;
    shipment.shippedAt = null;
    shipment.deliveredAt = null;
    history.length = 0;
  });

  it('creates a provider shipment with tracking and publishes ShipmentCreated', async () => {
    const result = await service.createShipment({ orderId: order.id });

    expect(result.status).toBe(ShipmentStatus.CREATED);
    expect(result.trackingCode).toMatch(/^LOCAL-/);
    expect(ordersService.updateFulfillmentStatus).toHaveBeenCalledWith(
      order.id,
      OrderFulfillmentStatus.PROCESSING,
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ShipmentCreated', shipmentId: shipment.id }),
    );
  });

  it('tracks status history and publishes ShipmentDelivered on final delivery', async () => {
    await service.createShipment({ orderId: order.id });
    await service.updateStatus(shipment.id, { status: ShipmentStatus.IN_TRANSIT });
    await service.updateStatus(shipment.id, { status: ShipmentStatus.DELIVERED });

    expect(ordersService.updateFulfillmentStatus).toHaveBeenLastCalledWith(
      order.id,
      OrderFulfillmentStatus.FULFILLED,
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ShipmentDelivered', shipmentId: shipment.id }),
    );
    expect(history.map((entry) => entry.status)).toEqual([
      ShipmentStatus.CREATED,
      ShipmentStatus.IN_TRANSIT,
      ShipmentStatus.DELIVERED,
    ]);
  });
});
