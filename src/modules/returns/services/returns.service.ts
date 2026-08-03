import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CartStatus,
  OrderFulfillmentStatus,
  OrderPaymentStatus,
  OrderRefundStatus,
  OrderStatus,
  Prisma,
  ReturnRequestStatus,
  ReturnRequestType,
} from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AuthenticatedStaff } from '../../auth/types/authenticated-staff';
import { AuthenticatedCustomer } from '../../customers/types/authenticated-customer';
import { InventoryService } from '../../inventory/services/inventory.service';
import { SettingsService } from '../../settings/services/settings.service';
import { CreateReturnRequestDto } from '../dto/create-return-request.dto';
import { ListReturnRequestsQueryDto } from '../dto/list-return-requests-query.dto';
import { ReviewReturnRequestDto } from '../dto/review-return-request.dto';

const returnInclude = Prisma.validator<Prisma.ReturnRequestInclude>()({
  items: {
    orderBy: { createdAt: 'asc' },
    include: { orderItem: true },
  },
  order: {
    select: {
      id: true,
      orderNumber: true,
      currency: true,
      fulfillmentStatus: true,
      refundStatus: true,
      createdAt: true,
    },
  },
  replacementOrder: {
    select: { id: true, orderNumber: true, fulfillmentStatus: true },
  },
  customer: {
    select: { id: true, name: true, email: true, phone: true },
  },
});

type ReturnRecord = Prisma.ReturnRequestGetPayload<{ include: typeof returnInclude }>;

@Injectable()
export class ReturnsService {
  private readonly reservationLifetimeMs = 15 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly inventoryService: InventoryService,
  ) {}

  async create(dto: CreateReturnRequestDto, customer: AuthenticatedCustomer) {
    const settings = await this.settingsService.get();
    if (!settings.returnsEnabled) {
      throw new ConflictException({
        code: 'RETURNS_DISABLED',
        message: 'Returns and exchanges are currently unavailable.',
      });
    }
    const itemIds = dto.items.map((item) => item.orderItemId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new BadRequestException({
        code: 'DUPLICATE_RETURN_ITEM',
        message: 'Each order item can appear only once in a return request.',
      });
    }

    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, customerId: customer.id },
      include: {
        items: { where: { id: { in: itemIds } } },
        shipments: { select: { deliveredAt: true } },
      },
    });
    if (!order) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'The order was not found.',
      });
    }
    if (
      order.fulfillmentStatus !== OrderFulfillmentStatus.FULFILLED &&
      order.status !== OrderStatus.COMPLETED
    ) {
      throw new ConflictException({
        code: 'ORDER_NOT_DELIVERED',
        message: 'A return can be requested only after delivery.',
      });
    }
    if (order.items.length !== itemIds.length) {
      throw new BadRequestException({
        code: 'RETURN_ITEM_NOT_IN_ORDER',
        message: 'One or more selected items do not belong to this order.',
      });
    }

    const deliveredAt =
      order.shipments
        .map((shipment) => shipment.deliveredAt)
        .filter((value): value is Date => Boolean(value))
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? order.updatedAt;
    const deadline = new Date(
      deliveredAt.getTime() + settings.returnWindowDays * 24 * 60 * 60 * 1000,
    );
    if (deadline < new Date()) {
      throw new ConflictException({
        code: 'RETURN_WINDOW_EXPIRED',
        message: 'The return request window has expired.',
        details: { deliveredAt, deadline, returnWindowDays: settings.returnWindowDays },
      });
    }

    const previousItems = await this.prisma.returnRequestItem.findMany({
      where: {
        orderItemId: { in: itemIds },
        returnRequest: {
          status: {
            notIn: [ReturnRequestStatus.REJECTED, ReturnRequestStatus.CANCELLED],
          },
        },
      },
      select: { orderItemId: true, quantity: true },
    });
    const alreadyRequested = new Map<string, number>();
    for (const item of previousItems) {
      alreadyRequested.set(
        item.orderItemId,
        (alreadyRequested.get(item.orderItemId) ?? 0) + item.quantity,
      );
    }
    for (const requested of dto.items) {
      const ordered = order.items.find((item) => item.id === requested.orderItemId)!;
      const remaining = ordered.quantity - (alreadyRequested.get(ordered.id) ?? 0);
      if (requested.quantity > remaining) {
        throw new ConflictException({
          code: 'RETURN_QUANTITY_EXCEEDED',
          message: 'The requested return quantity exceeds the eligible quantity.',
          details: { orderItemId: ordered.id, requested: requested.quantity, remaining },
        });
      }
    }

    const created = await this.prisma.returnRequest.create({
      data: {
        orderId: order.id,
        customerId: customer.id,
        type: dto.type,
        reason: dto.reason.trim(),
        customerNote: dto.customerNote?.trim(),
        items: {
          create: dto.items.map((item) => ({
            orderItemId: item.orderItemId,
            quantity: item.quantity,
            reason: item.reason?.trim(),
          })),
        },
      },
      include: returnInclude,
    });
    return this.serialize(created);
  }

  async list(query: ListReturnRequestsQueryDto, customerId?: string) {
    const where: Prisma.ReturnRequestWhereInput = {
      customerId,
      type: query.type,
      status: query.status,
    };
    const skip = (query.page - 1) * query.limit;
    const [total, records] = await this.prisma.$transaction([
      this.prisma.returnRequest.count({ where }),
      this.prisma.returnRequest.findMany({
        where,
        include: returnInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
    ]);
    return {
      items: records.map((record) => this.serialize(record)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pageCount: Math.ceil(total / query.limit),
      },
    };
  }

  async getCustomer(id: string, customerId: string) {
    const record = await this.requireReturn(id);
    if (record.customerId !== customerId) {
      throw new UnauthorizedException({
        code: 'RETURN_ACCESS_DENIED',
        message: 'This return request does not belong to the authenticated customer.',
      });
    }
    return this.serialize(record);
  }

  async getAdmin(id: string) {
    return this.serialize(await this.requireReturn(id));
  }

  async cancel(id: string, customerId: string) {
    const record = await this.requireReturn(id);
    if (record.customerId !== customerId) {
      throw new UnauthorizedException({
        code: 'RETURN_ACCESS_DENIED',
        message: 'This return request does not belong to the authenticated customer.',
      });
    }
    if (record.status === ReturnRequestStatus.CANCELLED) return this.serialize(record);
    if (record.status !== ReturnRequestStatus.REQUESTED) {
      throw new ConflictException({
        code: 'RETURN_CANNOT_BE_CANCELLED',
        message: 'Only a pending return request can be cancelled.',
      });
    }
    return this.serialize(
      await this.prisma.returnRequest.update({
        where: { id },
        data: { status: ReturnRequestStatus.CANCELLED, closedAt: new Date() },
        include: returnInclude,
      }),
    );
  }

  async review(id: string, dto: ReviewReturnRequestDto, staff: AuthenticatedStaff) {
    const record = await this.requireReturn(id);
    if (
      dto.status === ReturnRequestStatus.CLOSED &&
      record.type === ReturnRequestType.RETURN &&
      record.order.refundStatus !== OrderRefundStatus.PARTIAL &&
      record.order.refundStatus !== OrderRefundStatus.FULL
    ) {
      throw new ConflictException({
        code: 'RETURN_REFUND_NOT_RECORDED',
        message: 'The payment refund must be completed before closing the return.',
      });
    }
    if (
      dto.status === ReturnRequestStatus.CLOSED &&
      record.type === ReturnRequestType.EXCHANGE &&
      record.replacementOrder?.fulfillmentStatus !== OrderFulfillmentStatus.FULFILLED
    ) {
      throw new ConflictException({
        code: 'REPLACEMENT_NOT_DELIVERED',
        message: 'The replacement order must be delivered before closing the exchange.',
      });
    }
    const allowed = this.allowedReviewStatuses(record);
    if (!allowed.includes(dto.status)) {
      throw new ConflictException({
        code: 'INVALID_RETURN_TRANSITION',
        message: 'The requested return status transition is not allowed.',
        details: { currentStatus: record.status, requestedStatus: dto.status, allowed },
      });
    }
    const now = new Date();
    const outcome = await this.prisma.returnRequest.updateMany({
      where: { id, status: record.status },
      data: {
        status: dto.status,
        adminNote: dto.adminNote?.trim(),
        reviewedByStaffId: staff.id,
        reviewedAt:
          dto.status === ReturnRequestStatus.APPROVED ||
          dto.status === ReturnRequestStatus.REJECTED
            ? now
            : record.reviewedAt,
        receivedAt: dto.status === ReturnRequestStatus.RECEIVED ? now : record.receivedAt,
        closedAt:
          dto.status === ReturnRequestStatus.REJECTED ||
          dto.status === ReturnRequestStatus.CLOSED
            ? now
            : record.closedAt,
      },
    });
    if (outcome.count === 0) {
      throw new ConflictException({
        code: 'RETURN_CHANGED_CONCURRENTLY',
        message: 'The return request changed while it was being reviewed.',
      });
    }
    return this.serialize(await this.requireReturn(id));
  }

  async createReplacementOrder(id: string, staff: AuthenticatedStaff) {
    const record = await this.requireReturn(id);
    if (record.type !== ReturnRequestType.EXCHANGE) {
      throw new ConflictException({
        code: 'RETURN_IS_NOT_EXCHANGE',
        message: 'A replacement order can be created only for an exchange.',
      });
    }
    if (record.replacementOrderId) return this.serialize(record);
    if (record.status !== ReturnRequestStatus.RECEIVED) {
      throw new ConflictException({
        code: 'EXCHANGE_NOT_RECEIVED',
        message: 'The returned items must be received before creating a replacement order.',
      });
    }

    const claimed = await this.prisma.returnRequest.updateMany({
      where: {
        id,
        status: ReturnRequestStatus.RECEIVED,
        replacementOrderId: null,
      },
      data: { status: ReturnRequestStatus.REPLACEMENT_CREATED },
    });
    if (claimed.count === 0) {
      throw new ConflictException({
        code: 'EXCHANGE_CHANGED_CONCURRENTLY',
        message: 'The exchange is already being processed.',
      });
    }

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: record.orderId },
      include: { items: true },
    });
    const replacementOrderId = randomUUID();
    const replacementCartId = randomUUID();
    const reservationEnds = new Date(Date.now() + this.reservationLifetimeMs);
    const reservations: Array<{ id: string; orderItemId: string }> = [];
    let replacementCreated = false;

    try {
      for (const returnedItem of record.items) {
        const originalItem = order.items.find((item) => item.id === returnedItem.orderItemId)!;
        const reservation = await this.inventoryService.reserveStock({
          variantId: originalItem.variantId,
          quantity: returnedItem.quantity,
          externalReference: `exchange:${record.id}:item:${returnedItem.id}`,
          expiresAt: reservationEnds.toISOString(),
        });
        reservations.push({ id: reservation.id, orderItemId: originalItem.id });
      }

      await this.prisma.$transaction(async (transaction) => {
        await transaction.cart.create({
          data: {
            id: replacementCartId,
            customerId: order.customerId,
            currency: order.currency,
            status: CartStatus.CONVERTED,
            expiresAt: reservationEnds,
          },
        });
        await transaction.order.create({
          data: {
            id: replacementOrderId,
            orderNumber: this.createReplacementOrderNumber(replacementOrderId),
            cartId: replacementCartId,
            customerId: order.customerId,
            shippingMethodId: order.shippingMethodId,
            status: OrderStatus.CONFIRMED,
            paymentStatus: OrderPaymentStatus.PAID,
            fulfillmentStatus: OrderFulfillmentStatus.UNFULFILLED,
            refundStatus: OrderRefundStatus.NONE,
            currency: order.currency,
            subtotal: new Prisma.Decimal(0),
            discountTotal: new Prisma.Decimal(0),
            shippingTotal: new Prisma.Decimal(0),
            shippingDiscountTotal: new Prisma.Decimal(0),
            taxTotal: new Prisma.Decimal(0),
            grandTotal: new Prisma.Decimal(0),
            customerSnapshot: order.customerSnapshot as Prisma.InputJsonValue,
            billingAddressSnapshot: order.billingAddressSnapshot as Prisma.InputJsonValue,
            shippingAddressSnapshot: order.shippingAddressSnapshot as Prisma.InputJsonValue,
            pricingSnapshot: {
              kind: 'EXCHANGE_REPLACEMENT',
              returnRequestId: record.id,
              originalOrderId: order.id,
            },
            shippingMethodSnapshot: order.shippingMethodSnapshot ?? undefined,
            customerNote: `Replacement for exchange ${record.id}`,
            inventoryReservationEnds: reservationEnds,
            items: {
              create: record.items.map((returnedItem) => {
                const originalItem = order.items.find(
                  (item) => item.id === returnedItem.orderItemId,
                )!;
                const reservation = reservations.find(
                  (entry) => entry.orderItemId === originalItem.id,
                )!;
                return {
                  variantId: originalItem.variantId,
                  inventoryReservationId: reservation.id,
                  productName: originalItem.productName,
                  productSlug: originalItem.productSlug,
                  variantName: originalItem.variantName,
                  sku: originalItem.sku,
                  imageUrl: originalItem.imageUrl,
                  unitPrice: new Prisma.Decimal(0),
                  quantity: returnedItem.quantity,
                  lineSubtotal: new Prisma.Decimal(0),
                  lineDiscount: new Prisma.Decimal(0),
                  lineTax: new Prisma.Decimal(0),
                  lineTotal: new Prisma.Decimal(0),
                };
              }),
            },
            internalNotes: {
              create: {
                staffUserId: staff.id,
                note: `Replacement order created from exchange request ${record.id}.`,
              },
            },
          },
        });
      });
      replacementCreated = true;
      await this.inventoryService.confirmReservations(
        reservations.map((reservation) => reservation.id),
      );
      await this.prisma.returnRequest.update({
        where: { id },
        data: {
          replacementOrderId,
          reviewedByStaffId: staff.id,
          reviewedAt: new Date(),
        },
      });
      return this.serialize(await this.requireReturn(id));
    } catch (error) {
      if (replacementCreated) {
        await this.prisma.order.delete({ where: { id: replacementOrderId } }).catch(() => undefined);
        await this.prisma.cart.delete({ where: { id: replacementCartId } }).catch(() => undefined);
      }
      await Promise.allSettled(
        reservations.map((reservation) =>
          this.inventoryService.releaseReservation(reservation.id),
        ),
      );
      await this.prisma.returnRequest.updateMany({
        where: { id, replacementOrderId: null },
        data: { status: ReturnRequestStatus.RECEIVED },
      });
      throw error;
    }
  }

  private allowedReviewStatuses(record: ReturnRecord): ReturnRequestStatus[] {
    if (record.status === ReturnRequestStatus.REQUESTED) {
      return [ReturnRequestStatus.APPROVED, ReturnRequestStatus.REJECTED];
    }
    if (record.status === ReturnRequestStatus.APPROVED) {
      return [ReturnRequestStatus.RECEIVED];
    }
    if (
      record.status === ReturnRequestStatus.RECEIVED &&
      record.type === ReturnRequestType.RETURN
    ) {
      return [ReturnRequestStatus.CLOSED];
    }
    if (record.status === ReturnRequestStatus.REPLACEMENT_CREATED) {
      return [ReturnRequestStatus.CLOSED];
    }
    return [];
  }

  private async requireReturn(id: string): Promise<ReturnRecord> {
    const record = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: returnInclude,
    });
    if (!record) {
      throw new NotFoundException({
        code: 'RETURN_REQUEST_NOT_FOUND',
        message: 'The return request was not found.',
      });
    }
    return record;
  }

  private createReplacementOrderNumber(id: string): string {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `EX-${date}-${id.replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  }

  private serialize(record: ReturnRecord) {
    return {
      id: record.id,
      orderId: record.orderId,
      customerId: record.customerId,
      type: record.type,
      status: record.status,
      reason: record.reason,
      customerNote: record.customerNote,
      adminNote: record.adminNote,
      reviewedByStaffId: record.reviewedByStaffId,
      reviewedAt: record.reviewedAt,
      receivedAt: record.receivedAt,
      closedAt: record.closedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      order: record.order,
      customer: record.customer,
      replacementOrder: record.replacementOrder,
      items: record.items.map((item) => ({
        id: item.id,
        orderItemId: item.orderItemId,
        quantity: item.quantity,
        reason: item.reason,
        productName: item.orderItem.productName,
        productSlug: item.orderItem.productSlug,
        variantName: item.orderItem.variantName,
        sku: item.orderItem.sku,
        imageUrl: item.orderItem.imageUrl,
        orderedQuantity: item.orderItem.quantity,
        unitPrice: item.orderItem.unitPrice.toFixed(2),
        lineTotal: item.orderItem.lineTotal.toFixed(2),
      })),
    };
  }
}
