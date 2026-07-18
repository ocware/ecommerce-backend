import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  OrderFulfillmentStatus,
  OrderPaymentStatus,
  OrderStatus,
  Prisma,
  ShipmentStatus,
} from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AuthenticatedCustomer } from '../../customers/types/authenticated-customer';
import { OrdersService, ShippingOrderView } from '../../orders/services/orders.service';
import { ProviderShipmentResult, ShippingAddress } from '../contracts/shipping-provider';
import { CreateShipmentDto } from '../dto/create-shipment.dto';
import { ListShipmentsQueryDto } from '../dto/list-shipments-query.dto';
import { UpdateShipmentStatusDto } from '../dto/update-shipment-status.dto';
import { ShipmentEventPublisher } from './shipment-event-publisher.service';
import { ShippingProviderRegistry } from './shipping-provider-registry.service';

const shipmentInclude = Prisma.validator<Prisma.ShipmentInclude>()({
  shippingMethod: true,
  statusHistory: { orderBy: { occurredAt: 'asc' } },
});
type ShipmentRecord = Prisma.ShipmentGetPayload<{ include: typeof shipmentInclude }>;

@Injectable()
export class ShippingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly providerRegistry: ShippingProviderRegistry,
    private readonly eventPublisher: ShipmentEventPublisher,
  ) {}

  async createShipment(dto: CreateShipmentDto) {
    const order = await this.ordersService.getShippingOrderForAdmin(dto.orderId);
    this.assertOrderShippable(order);
    const methodId = dto.shippingMethodId ?? order.shippingMethodId;
    if (!methodId) {
      throw new ConflictException({
        code: 'SHIPPING_METHOD_REQUIRED',
        message: 'The order has no selected shipping method.',
      });
    }
    const existing = await this.prisma.shipment.findFirst({
      where: {
        orderId: order.id,
        status: {
          notIn: [ShipmentStatus.CANCELLED, ShipmentStatus.FAILED],
        },
      },
      include: shipmentInclude,
    });
    if (existing) return this.serializeShipment(existing);

    const method = await this.prisma.shippingMethod.findUnique({ where: { id: methodId } });
    if (!method || !method.isActive) {
      throw new NotFoundException({
        code: 'SHIPPING_METHOD_NOT_FOUND',
        message: 'The selected shipping method is unavailable.',
      });
    }
    const id = randomUUID();
    const estimatedDeliveryAt = this.getEstimatedDelivery(order, method.estimatedMaxDays);
    await this.prisma.shipment.create({
      data: {
        id,
        orderId: order.id,
        shippingMethodId: method.id,
        provider: method.provider,
        cost: new Prisma.Decimal(order.shippingCost),
        currency: order.currency,
        addressSnapshot: order.shippingAddress as unknown as Prisma.InputJsonValue,
        estimatedDeliveryAt,
        statusHistory: {
          create: { status: ShipmentStatus.PENDING, description: 'Shipment creation started.' },
        },
      },
    });
    const pending = await this.requireShipment(id);

    let providerResult: ProviderShipmentResult;
    try {
      providerResult = await this.providerRegistry.get(method.provider).createShipment({
        shipmentId: pending.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        methodCode: method.code,
        address: order.shippingAddress as unknown as ShippingAddress,
        estimatedDeliveryAt,
      });
    } catch (error) {
      await this.applyStatus(pending, ShipmentStatus.FAILED, 'Provider shipment creation failed.');
      throw error;
    }
    const shipment = await this.applyProviderResult(pending, providerResult, 'Shipment created.');
    this.eventPublisher.publish({
      name: 'ShipmentCreated',
      occurredAt: new Date(),
      shipmentId: shipment.id,
      orderId: shipment.orderId,
      provider: shipment.provider,
      trackingCode: shipment.trackingCode,
    });
    return this.serializeShipment(shipment);
  }

  async listAdminShipments(query: ListShipmentsQueryDto) {
    const where: Prisma.ShipmentWhereInput = { status: query.status };
    const skip = (query.page - 1) * query.limit;
    const [total, shipments] = await this.prisma.$transaction([
      this.prisma.shipment.count({ where }),
      this.prisma.shipment.findMany({
        where,
        include: shipmentInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
    ]);
    return {
      items: shipments.map((shipment) => this.serializeShipment(shipment)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pageCount: Math.ceil(total / query.limit),
      },
    };
  }

  async getAdminShipment(id: string) {
    return this.serializeShipment(await this.requireShipment(id));
  }

  async listCustomerOrderShipments(orderId: string, customer: AuthenticatedCustomer) {
    await this.ordersService.getShippingOrderForCustomer(orderId, customer);
    return this.listOrderShipments(orderId);
  }

  async listGuestOrderShipments(orderId: string, guestToken?: string) {
    await this.ordersService.getShippingOrderForGuest(orderId, guestToken);
    return this.listOrderShipments(orderId);
  }

  async updateStatus(id: string, dto: UpdateShipmentStatusDto) {
    const shipment = await this.requireShipment(id);
    return this.serializeShipment(
      await this.applyStatus(
        shipment,
        dto.status,
        dto.description,
        dto.estimatedDeliveryAt ? new Date(dto.estimatedDeliveryAt) : undefined,
      ),
    );
  }

  async trackShipment(id: string) {
    const shipment = await this.requireShipment(id);
    if (!shipment.providerReference) {
      throw new ConflictException({
        code: 'SHIPMENT_PROVIDER_REFERENCE_MISSING',
        message: 'The shipment has no provider reference.',
      });
    }
    const result = await this.providerRegistry.get(shipment.provider).trackShipment({
      providerReference: shipment.providerReference,
      trackingCode: shipment.trackingCode,
      currentStatus: this.toProviderStatus(shipment.status),
    });
    return this.serializeShipment(
      await this.applyProviderResult(shipment, result, 'Shipment tracking updated.'),
    );
  }

  async refreshShipmentTracking(limit = 100) {
    const shipments = await this.prisma.shipment.findMany({
      where: {
        providerReference: { not: null },
        status: {
          in: [ShipmentStatus.CREATED, ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY],
        },
      },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
    const results = [];
    for (const shipment of shipments) {
      results.push(await this.trackShipment(shipment.id));
    }
    return { examined: shipments.length, shipments: results };
  }

  async cancelShipment(id: string) {
    const shipment = await this.requireShipment(id);
    if (shipment.status === ShipmentStatus.CANCELLED) return this.serializeShipment(shipment);
    if (shipment.status === ShipmentStatus.DELIVERED) {
      throw new ConflictException({
        code: 'DELIVERED_SHIPMENT_CANNOT_BE_CANCELLED',
        message: 'A delivered shipment cannot be cancelled.',
      });
    }
    if (!shipment.providerReference) {
      return this.serializeShipment(
        await this.applyStatus(shipment, ShipmentStatus.CANCELLED, 'Shipment cancelled.'),
      );
    }
    const result = await this.providerRegistry
      .get(shipment.provider)
      .cancelShipment(shipment.providerReference);
    return this.serializeShipment(
      await this.applyProviderResult(shipment, result, 'Shipment cancelled.'),
    );
  }

  private async applyProviderResult(
    shipment: ShipmentRecord,
    result: ProviderShipmentResult,
    description: string,
  ): Promise<ShipmentRecord> {
    return this.applyStatus(shipment, result.status, description, result.estimatedDeliveryAt, {
      providerReference: result.providerReference,
      trackingCode: result.trackingCode ?? shipment.trackingCode,
      metadata: result.metadata,
    });
  }

  private async applyStatus(
    shipment: ShipmentRecord,
    status: ShipmentStatus,
    description?: string,
    estimatedDeliveryAt?: Date,
    providerData: {
      providerReference?: string;
      trackingCode?: string | null;
      metadata?: Record<string, string | number | boolean | null>;
    } = {},
  ): Promise<ShipmentRecord> {
    if (shipment.status === status && !estimatedDeliveryAt && !providerData.providerReference) {
      return shipment;
    }
    const previousStatus = shipment.status;
    this.assertStatusTransition(shipment.status, status);
    const now = new Date();
    const updated = await this.prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        status,
        estimatedDeliveryAt,
        providerReference: providerData.providerReference,
        trackingCode: providerData.trackingCode,
        metadata: providerData.metadata,
        shippedAt: status === ShipmentStatus.IN_TRANSIT && !shipment.shippedAt ? now : undefined,
        deliveredAt: status === ShipmentStatus.DELIVERED ? now : undefined,
        cancelledAt: status === ShipmentStatus.CANCELLED ? now : undefined,
        statusHistory: {
          create: { status, description, metadata: providerData.metadata },
        },
      },
      include: shipmentInclude,
    });
    await this.syncOrderFulfillment(updated.orderId);
    if (previousStatus !== ShipmentStatus.DELIVERED && status === ShipmentStatus.DELIVERED) {
      this.eventPublisher.publish({
        name: 'ShipmentDelivered',
        occurredAt: now,
        shipmentId: updated.id,
        orderId: updated.orderId,
        trackingCode: updated.trackingCode,
      });
    }
    return updated;
  }

  private async syncOrderFulfillment(orderId: string): Promise<void> {
    const shipments = await this.prisma.shipment.findMany({
      where: { orderId, status: { notIn: [ShipmentStatus.CANCELLED, ShipmentStatus.FAILED] } },
      select: { status: true },
    });
    let fulfillmentStatus: OrderFulfillmentStatus = OrderFulfillmentStatus.UNFULFILLED;
    if (
      shipments.length &&
      shipments.every((shipment) => shipment.status === ShipmentStatus.DELIVERED)
    ) {
      fulfillmentStatus = OrderFulfillmentStatus.FULFILLED;
    } else if (shipments.some((shipment) => shipment.status === ShipmentStatus.DELIVERED)) {
      fulfillmentStatus = OrderFulfillmentStatus.PARTIALLY_FULFILLED;
    } else if (shipments.length) {
      fulfillmentStatus = OrderFulfillmentStatus.PROCESSING;
    }
    await this.ordersService.updateFulfillmentStatus(orderId, fulfillmentStatus);
  }

  private async listOrderShipments(orderId: string) {
    const shipments = await this.prisma.shipment.findMany({
      where: { orderId },
      include: shipmentInclude,
      orderBy: { createdAt: 'desc' },
    });
    return shipments.map((shipment) => this.serializeShipment(shipment));
  }

  private async requireShipment(id: string): Promise<ShipmentRecord> {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
      include: shipmentInclude,
    });
    if (!shipment) {
      throw new NotFoundException({
        code: 'SHIPMENT_NOT_FOUND',
        message: 'Shipment was not found.',
      });
    }
    return shipment;
  }

  private assertOrderShippable(order: ShippingOrderView): void {
    const paid =
      order.paymentStatus === OrderPaymentStatus.PAID ||
      order.paymentStatus === OrderPaymentStatus.AUTHORIZED ||
      order.paymentStatus === OrderPaymentStatus.PARTIALLY_REFUNDED;
    if (order.status === OrderStatus.CANCELLED || !paid) {
      throw new ConflictException({
        code: 'ORDER_NOT_READY_FOR_SHIPMENT',
        message: 'The order must be paid or authorized before shipment creation.',
      });
    }
  }

  private assertStatusTransition(current: ShipmentStatus, next: ShipmentStatus): void {
    const transitions: Record<ShipmentStatus, ShipmentStatus[]> = {
      [ShipmentStatus.PENDING]: [
        ShipmentStatus.CREATED,
        ShipmentStatus.FAILED,
        ShipmentStatus.CANCELLED,
      ],
      [ShipmentStatus.CREATED]: [
        ShipmentStatus.IN_TRANSIT,
        ShipmentStatus.CANCELLED,
        ShipmentStatus.FAILED,
      ],
      [ShipmentStatus.IN_TRANSIT]: [
        ShipmentStatus.OUT_FOR_DELIVERY,
        ShipmentStatus.DELIVERED,
        ShipmentStatus.FAILED,
      ],
      [ShipmentStatus.OUT_FOR_DELIVERY]: [ShipmentStatus.DELIVERED, ShipmentStatus.FAILED],
      [ShipmentStatus.DELIVERED]: [],
      [ShipmentStatus.CANCELLED]: [],
      [ShipmentStatus.FAILED]: [ShipmentStatus.CREATED, ShipmentStatus.CANCELLED],
    };
    if (current !== next && !transitions[current].includes(next)) {
      throw new ConflictException({
        code: 'INVALID_SHIPMENT_STATUS_TRANSITION',
        message: `Shipment cannot transition from ${current} to ${next}.`,
      });
    }
  }

  private getEstimatedDelivery(order: ShippingOrderView, maxDays: number): Date {
    const snapshot = order.shippingMethod;
    if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
      const value = snapshot.estimatedDeliveryAt;
      if (typeof value === 'string') return new Date(value);
    }
    return new Date(Date.now() + maxDays * 24 * 60 * 60 * 1000);
  }

  private toProviderStatus(status: ShipmentStatus) {
    if (status === ShipmentStatus.PENDING) return 'CREATED' as const;
    return status;
  }

  private serializeShipment(shipment: ShipmentRecord) {
    return {
      ...shipment,
      cost: shipment.cost.toFixed(2),
      shippingMethod: {
        id: shipment.shippingMethod.id,
        code: shipment.shippingMethod.code,
        name: shipment.shippingMethod.name,
        type: shipment.shippingMethod.type,
      },
    };
  }
}
