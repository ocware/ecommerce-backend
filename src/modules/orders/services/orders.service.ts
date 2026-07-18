import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  OrderFulfillmentStatus,
  OrderPaymentStatus,
  OrderRefundStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AuthenticatedStaff } from '../../auth/types/authenticated-staff';
import { CartService, CheckoutCartView } from '../../cart/services/cart.service';
import { AuthenticatedCustomer } from '../../customers/types/authenticated-customer';
import { DiscountsService } from '../../discounts/services/discounts.service';
import { InventoryService } from '../../inventory/services/inventory.service';
import { ShippingRatesService } from '../../shipping/services/shipping-rates.service';
import { AddOrderNoteDto } from '../dto/add-order-note.dto';
import { CancelOrderDto } from '../dto/cancel-order.dto';
import { CheckoutCustomerDto } from '../dto/checkout-customer.dto';
import { CheckoutDto } from '../dto/checkout.dto';
import { ListOrdersQueryDto } from '../dto/list-orders-query.dto';
import { OrderEventPublisher } from './order-event-publisher.service';

const orderInclude = Prisma.validator<Prisma.OrderInclude>()({
  items: { orderBy: { createdAt: 'asc' } },
  internalNotes: {
    orderBy: { createdAt: 'asc' },
    include: { staffUser: { select: { id: true, name: true, email: true } } },
  },
});

type OrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
type CheckoutAccess = { customerId: string } | { guestToken?: string };

export type PaymentOrderView = {
  id: string;
  orderNumber: string;
  cartId: string;
  customerId: string | null;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  refundStatus: OrderRefundStatus;
  amount: string;
  currency: string;
  customer: Prisma.JsonValue;
  inventoryReservationIds: string[];
};

export type ShippingOrderView = {
  id: string;
  orderNumber: string;
  cartId: string;
  customerId: string | null;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  fulfillmentStatus: OrderFulfillmentStatus;
  currency: string;
  shippingCost: string;
  shippingMethodId: string | null;
  shippingMethod: Prisma.JsonValue | null;
  shippingAddress: Prisma.JsonValue;
};

export type NotificationOrderView = {
  id: string;
  orderNumber: string;
  customerId: string | null;
  customer: { name: string; email?: string; phone?: string };
  total: string;
  currency: string;
};

@Injectable()
export class OrdersService {
  private readonly reservationLifetimeMs = 15 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly inventoryService: InventoryService,
    private readonly discountsService: DiscountsService,
    private readonly eventPublisher: OrderEventPublisher,
    private readonly shippingRatesService: ShippingRatesService,
  ) {}

  checkoutCustomer(dto: CheckoutDto, customer: AuthenticatedCustomer) {
    return this.checkout(
      dto,
      { customerId: customer.id },
      dto.customer ?? {
        name: customer.name,
        email: customer.email ?? undefined,
        phone: customer.phone ?? undefined,
      },
    );
  }

  checkoutGuest(dto: CheckoutDto, guestToken?: string) {
    if (!dto.customer) {
      throw new BadRequestException({
        code: 'GUEST_CUSTOMER_DETAILS_REQUIRED',
        message: 'Customer details are required for guest checkout.',
      });
    }
    return this.checkout(dto, { guestToken }, dto.customer);
  }

  async listCustomerOrders(query: ListOrdersQueryDto, customer: AuthenticatedCustomer) {
    return this.listOrders(query, customer.id);
  }

  async getCustomerOrder(id: string, customer: AuthenticatedCustomer) {
    const order = await this.requireOrder(id);
    this.assertCustomerAccess(order, customer.id);
    return this.serializeOrder(order, false);
  }

  async cancelCustomerOrder(id: string, dto: CancelOrderDto, customer: AuthenticatedCustomer) {
    const order = await this.requireOrder(id);
    this.assertCustomerAccess(order, customer.id);
    return this.cancelOrder(order, dto.reason);
  }

  async listAdminOrders(query: ListOrdersQueryDto) {
    return this.listOrders(query);
  }

  async getAdminOrder(id: string) {
    return this.serializeOrder(await this.requireOrder(id), true);
  }

  async getNotificationOrder(id: string): Promise<NotificationOrderView> {
    const order = await this.requireOrder(id);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customer: order.customerSnapshot as unknown as NotificationOrderView['customer'],
      total: order.grandTotal.toFixed(2),
      currency: order.currency,
    };
  }

  async cancelAdminOrder(id: string, dto: CancelOrderDto, staff: AuthenticatedStaff) {
    return this.cancelOrder(await this.requireOrder(id), dto.reason, staff.id);
  }

  async addInternalNote(id: string, dto: AddOrderNoteDto, staff: AuthenticatedStaff) {
    await this.requireOrder(id);
    const note = await this.prisma.orderInternalNote.create({
      data: { orderId: id, staffUserId: staff.id, note: dto.note },
      include: { staffUser: { select: { id: true, name: true, email: true } } },
    });
    return note;
  }

  async listInternalNotes(id: string) {
    await this.requireOrder(id);
    return this.prisma.orderInternalNote.findMany({
      where: { orderId: id },
      orderBy: { createdAt: 'asc' },
      include: { staffUser: { select: { id: true, name: true, email: true } } },
    });
  }

  async getPaymentOrderForCustomer(
    id: string,
    customer: AuthenticatedCustomer,
  ): Promise<PaymentOrderView> {
    const order = await this.requireOrder(id);
    this.assertCustomerAccess(order, customer.id);
    return this.toPaymentOrder(order);
  }

  async getPaymentOrderForGuest(id: string, guestToken?: string): Promise<PaymentOrderView> {
    const order = await this.requireOrder(id);
    if (order.customerId) {
      throw new UnauthorizedException({
        code: 'ORDER_ACCESS_DENIED',
        message: 'This order is not a guest order.',
      });
    }
    await this.cartService.verifyCheckoutAccess(order.cartId, { guestToken });
    return this.toPaymentOrder(order);
  }

  async getPaymentOrderForAdmin(id: string): Promise<PaymentOrderView> {
    return this.toPaymentOrder(await this.requireOrder(id));
  }

  async markPaymentAuthorized(id: string): Promise<PaymentOrderView> {
    return this.completePaymentOrder(id, OrderPaymentStatus.AUTHORIZED);
  }

  async markPaymentSucceeded(id: string): Promise<PaymentOrderView> {
    return this.completePaymentOrder(id, OrderPaymentStatus.PAID);
  }

  async markPaymentFailed(id: string): Promise<PaymentOrderView> {
    const order = await this.requireOrder(id);
    if (
      order.paymentStatus === OrderPaymentStatus.PAID ||
      order.paymentStatus === OrderPaymentStatus.AUTHORIZED ||
      order.paymentStatus === OrderPaymentStatus.PARTIALLY_REFUNDED ||
      order.paymentStatus === OrderPaymentStatus.REFUNDED
    ) {
      return this.toPaymentOrder(order);
    }
    await Promise.all(
      order.items.map((item) =>
        this.inventoryService.releaseReservation(item.inventoryReservationId),
      ),
    );
    const updated = await this.prisma.order.update({
      where: { id },
      data: { paymentStatus: OrderPaymentStatus.FAILED },
      include: orderInclude,
    });
    return this.toPaymentOrder(updated);
  }

  async markRefunded(id: string, refundedAmount: string): Promise<PaymentOrderView> {
    const order = await this.requireOrder(id);
    const amount = new Prisma.Decimal(refundedAmount);
    if (amount.lessThanOrEqualTo(0) || amount.greaterThan(order.grandTotal)) {
      throw new ConflictException({
        code: 'INVALID_ORDER_REFUND_TOTAL',
        message: 'The refunded amount is invalid for this order.',
      });
    }
    const fullyRefunded = amount.equals(order.grandTotal);
    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        paymentStatus: fullyRefunded
          ? OrderPaymentStatus.REFUNDED
          : OrderPaymentStatus.PARTIALLY_REFUNDED,
        refundStatus: fullyRefunded ? OrderRefundStatus.FULL : OrderRefundStatus.PARTIAL,
      },
      include: orderInclude,
    });
    return this.toPaymentOrder(updated);
  }

  async getShippingOrderForCustomer(
    id: string,
    customer: AuthenticatedCustomer,
  ): Promise<ShippingOrderView> {
    const order = await this.requireOrder(id);
    this.assertCustomerAccess(order, customer.id);
    return this.toShippingOrder(order);
  }

  async getShippingOrderForGuest(id: string, guestToken?: string): Promise<ShippingOrderView> {
    const order = await this.requireOrder(id);
    if (order.customerId) {
      throw new UnauthorizedException({
        code: 'ORDER_ACCESS_DENIED',
        message: 'This order is not a guest order.',
      });
    }
    await this.cartService.verifyCheckoutAccess(order.cartId, { guestToken });
    return this.toShippingOrder(order);
  }

  async getShippingOrderForAdmin(id: string): Promise<ShippingOrderView> {
    return this.toShippingOrder(await this.requireOrder(id));
  }

  async updateFulfillmentStatus(
    id: string,
    fulfillmentStatus: OrderFulfillmentStatus,
  ): Promise<ShippingOrderView> {
    const order = await this.requireOrder(id);
    if (order.status === OrderStatus.CANCELLED) {
      throw new ConflictException({
        code: 'CANCELLED_ORDER_CANNOT_BE_FULFILLED',
        message: 'A cancelled order cannot be fulfilled.',
      });
    }
    const status =
      fulfillmentStatus === OrderFulfillmentStatus.FULFILLED
        ? OrderStatus.COMPLETED
        : fulfillmentStatus === OrderFulfillmentStatus.PROCESSING ||
            fulfillmentStatus === OrderFulfillmentStatus.PARTIALLY_FULFILLED
          ? OrderStatus.PROCESSING
          : fulfillmentStatus === OrderFulfillmentStatus.UNFULFILLED &&
              order.status === OrderStatus.PROCESSING
            ? OrderStatus.CONFIRMED
            : order.status;
    const updated = await this.prisma.order.update({
      where: { id },
      data: { fulfillmentStatus, status },
      include: orderInclude,
    });
    return this.toShippingOrder(updated);
  }

  private async checkout(
    dto: CheckoutDto,
    access: CheckoutAccess,
    customerSnapshot: CheckoutCustomerDto,
  ) {
    this.assertContactDetails(customerSnapshot);
    const existing = await this.prisma.order.findUnique({
      where: { cartId: dto.cartId },
      include: orderInclude,
    });
    if (existing) {
      await this.cartService.verifyCheckoutAccess(dto.cartId, access);
      return this.serializeOrder(existing, false);
    }

    const cart = await this.cartService.prepareCheckout(dto.cartId, access);
    const shippingQuote = dto.shippingMethodId
      ? await this.shippingRatesService.quoteForCheckout(
          dto.shippingMethodId,
          dto.shippingAddress,
          cart.totals.subtotal,
          cart.currency,
          cart.freeShipping,
        )
      : null;
    const shippingTotal = new Prisma.Decimal(shippingQuote?.price ?? cart.totals.shippingTotal);
    const shippingDiscountTotal = new Prisma.Decimal(shippingQuote?.discount ?? 0);
    const grandTotal = new Prisma.Decimal(cart.totals.grandTotal).plus(shippingQuote?.total ?? 0);
    const orderId = randomUUID();
    const orderNumber = this.createOrderNumber(orderId);
    const reservationEnds = new Date(
      Math.min(cart.expiresAt.getTime(), Date.now() + this.reservationLifetimeMs),
    );
    const reservations: Array<{ id: string; variantId: string }> = [];
    let redemptionsRecorded = false;

    try {
      for (const item of cart.items) {
        const reservation = await this.inventoryService.reserveStock({
          variantId: item.variantId,
          quantity: item.quantity,
          externalReference: `order:${orderId}:item:${item.id}`,
          expiresAt: reservationEnds.toISOString(),
        });
        reservations.push({ id: reservation.id, variantId: item.variantId });
      }

      await this.discountsService.recordRedemptions(orderId, cart.customerId, cart.discounts);
      redemptionsRecorded = cart.discounts.length > 0;
      const itemSnapshots = this.createItemSnapshots(cart, reservations);
      const order = await this.prisma.order.create({
        data: {
          id: orderId,
          orderNumber,
          cartId: cart.id,
          customerId: cart.customerId,
          shippingMethodId: shippingQuote?.methodId,
          currency: cart.currency,
          subtotal: new Prisma.Decimal(cart.totals.subtotal),
          discountTotal: new Prisma.Decimal(cart.totals.discountTotal),
          shippingTotal,
          shippingDiscountTotal,
          taxTotal: new Prisma.Decimal(cart.totals.taxTotal),
          grandTotal,
          customerSnapshot: { ...customerSnapshot },
          billingAddressSnapshot: { ...dto.billingAddress },
          shippingAddressSnapshot: { ...dto.shippingAddress },
          pricingSnapshot: {
            discountCode: cart.discountCode,
            discounts: cart.discounts.map((discount) => ({ ...discount })),
            freeShipping: cart.freeShipping,
            totals: {
              ...cart.totals,
              shippingTotal: shippingTotal.toFixed(2),
              shippingDiscountTotal: shippingDiscountTotal.toFixed(2),
              grandTotal: grandTotal.toFixed(2),
            },
          },
          shippingMethodSnapshot: shippingQuote
            ? {
                methodId: shippingQuote.methodId,
                code: shippingQuote.code,
                name: shippingQuote.name,
                type: shippingQuote.type,
                provider: shippingQuote.provider,
                estimatedMinDays: shippingQuote.estimatedMinDays,
                estimatedMaxDays: shippingQuote.estimatedMaxDays,
                estimatedDeliveryAt: shippingQuote.estimatedDeliveryAt.toISOString(),
                pickupInstructions: shippingQuote.pickupInstructions,
                pickupAddress: shippingQuote.pickupAddress,
              }
            : undefined,
          invoiceInformation: dto.invoiceInformation ? { ...dto.invoiceInformation } : undefined,
          customerNote: dto.customerNote,
          inventoryReservationEnds: reservationEnds,
          items: { create: itemSnapshots },
        },
        include: orderInclude,
      });

      await this.cartService.markConverted(cart.id);
      this.eventPublisher.publish({
        name: 'OrderCreated',
        occurredAt: new Date(),
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        total: order.grandTotal.toFixed(2),
        currency: order.currency,
      });
      return this.serializeOrder(order, false);
    } catch (error) {
      const concurrentOrder = await this.prisma.order.findUnique({
        where: { cartId: dto.cartId },
        include: orderInclude,
      });
      if (concurrentOrder && concurrentOrder.id !== orderId) {
        await this.compensateCheckout(orderId, reservations, redemptionsRecorded);
        return this.serializeOrder(concurrentOrder, false);
      }

      if (!concurrentOrder) {
        await this.compensateCheckout(orderId, reservations, redemptionsRecorded);
      }
      throw error;
    }
  }

  private async compensateCheckout(
    orderReference: string,
    reservations: Array<{ id: string }>,
    redemptionsRecorded: boolean,
  ): Promise<void> {
    if (redemptionsRecorded) {
      await Promise.resolve(this.discountsService.releaseRedemptions(orderReference)).catch(
        () => undefined,
      );
    }
    await Promise.allSettled(
      reservations.map((reservation) => this.inventoryService.releaseReservation(reservation.id)),
    );
  }

  private createItemSnapshots(
    cart: CheckoutCartView,
    reservations: Array<{ id: string; variantId: string }>,
  ) {
    const subtotal = new Prisma.Decimal(cart.totals.subtotal);
    const totalDiscount = new Prisma.Decimal(cart.totals.discountTotal);
    let allocatedDiscount = new Prisma.Decimal(0);

    return cart.items.map((item, index) => {
      const lineSubtotal = new Prisma.Decimal(item.lineSubtotal);
      const isLastItem = index === cart.items.length - 1;
      const lineDiscount = isLastItem
        ? totalDiscount.minus(allocatedDiscount)
        : subtotal.isZero()
          ? new Prisma.Decimal(0)
          : Prisma.Decimal.min(
              lineSubtotal,
              totalDiscount.mul(lineSubtotal).div(subtotal).toDecimalPlaces(2),
            );
      allocatedDiscount = allocatedDiscount.plus(lineDiscount);
      const reservation = reservations.find((entry) => entry.variantId === item.variantId);
      if (!reservation) {
        throw new ConflictException({
          code: 'INVENTORY_RESERVATION_MISSING',
          message: 'An inventory reservation is missing for an order item.',
        });
      }

      return {
        variantId: item.variantId,
        inventoryReservationId: reservation.id,
        productName: item.product.name,
        productSlug: item.product.slug,
        variantName: item.variant.name,
        sku: item.variant.sku,
        imageUrl: item.image,
        unitPrice: new Prisma.Decimal(item.unitPrice),
        quantity: item.quantity,
        lineSubtotal,
        lineDiscount,
        lineTax: new Prisma.Decimal(0),
        lineTotal: lineSubtotal.minus(lineDiscount),
      };
    });
  }

  private async cancelOrder(order: OrderRecord, reason: string, staffUserId?: string) {
    if (order.status === OrderStatus.CANCELLED) {
      return this.serializeOrder(order, Boolean(staffUserId));
    }
    const cancellableOrderStatus =
      order.status === OrderStatus.PENDING || order.status === OrderStatus.CONFIRMED;
    const cancellablePaymentStatus =
      order.paymentStatus === OrderPaymentStatus.PENDING ||
      order.paymentStatus === OrderPaymentStatus.FAILED;
    if (!cancellableOrderStatus || !cancellablePaymentStatus) {
      throw new ConflictException({
        code: 'ORDER_CANNOT_BE_CANCELLED',
        message: 'This order can no longer be cancelled.',
        details: { orderStatus: order.status, paymentStatus: order.paymentStatus },
      });
    }

    for (const item of order.items) {
      await this.inventoryService.releaseReservation(item.inventoryReservationId);
    }
    const cancellation = await this.prisma.order.updateMany({
      where: {
        id: order.id,
        status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED] },
        paymentStatus: { in: [OrderPaymentStatus.PENDING, OrderPaymentStatus.FAILED] },
      },
      data: {
        status: OrderStatus.CANCELLED,
        fulfillmentStatus: OrderFulfillmentStatus.CANCELLED,
        cancellationReason: reason,
        cancelledAt: new Date(),
        cancelledByStaffUserId: staffUserId,
      },
    });
    const updated = await this.requireOrder(order.id);
    if (cancellation.count === 0) {
      if (updated.status === OrderStatus.CANCELLED) {
        return this.serializeOrder(updated, Boolean(staffUserId));
      }
      throw new ConflictException({
        code: 'ORDER_CANNOT_BE_CANCELLED',
        message: 'This order can no longer be cancelled.',
        details: { orderStatus: updated.status, paymentStatus: updated.paymentStatus },
      });
    }
    this.eventPublisher.publish({
      name: 'OrderCancelled',
      occurredAt: new Date(),
      orderId: updated.id,
      orderNumber: updated.orderNumber,
      customerId: updated.customerId,
      reason,
    });
    return this.serializeOrder(updated, Boolean(staffUserId));
  }

  private async completePaymentOrder(
    id: string,
    paymentStatus: 'AUTHORIZED' | 'PAID',
  ): Promise<PaymentOrderView> {
    const order = await this.requireOrder(id);
    if (order.status === OrderStatus.CANCELLED) {
      throw new ConflictException({
        code: 'CANCELLED_ORDER_CANNOT_BE_PAID',
        message: 'A cancelled order cannot accept payment.',
      });
    }
    if (
      order.paymentStatus === OrderPaymentStatus.PAID ||
      (paymentStatus === OrderPaymentStatus.AUTHORIZED &&
        order.paymentStatus === OrderPaymentStatus.AUTHORIZED)
    ) {
      return this.toPaymentOrder(order);
    }
    await this.inventoryService.confirmReservations(
      order.items.map((item) => item.inventoryReservationId),
    );
    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        status: OrderStatus.CONFIRMED,
        paymentStatus,
      },
      include: orderInclude,
    });
    return this.toPaymentOrder(updated);
  }

  private async listOrders(query: ListOrdersQueryDto, customerId?: string) {
    const where: Prisma.OrderWhereInput = {
      customerId,
      status: query.status,
      paymentStatus: query.paymentStatus,
      fulfillmentStatus: query.fulfillmentStatus,
    };
    const skip = (query.page - 1) * query.limit;
    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
    ]);
    return {
      items: orders.map((order) => this.serializeOrder(order, customerId === undefined)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pageCount: Math.ceil(total / query.limit),
      },
    };
  }

  private async requireOrder(id: string): Promise<OrderRecord> {
    const order = await this.prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order was not found.' });
    }
    return order;
  }

  private assertCustomerAccess(order: Pick<OrderRecord, 'customerId'>, customerId: string): void {
    if (order.customerId !== customerId) {
      throw new UnauthorizedException({
        code: 'ORDER_ACCESS_DENIED',
        message: 'This order does not belong to the authenticated customer.',
      });
    }
  }

  private assertContactDetails(customer: CheckoutCustomerDto): void {
    if (!customer.email && !customer.phone) {
      throw new BadRequestException({
        code: 'CUSTOMER_CONTACT_REQUIRED',
        message: 'An email address or phone number is required for checkout.',
      });
    }
  }

  private createOrderNumber(orderId: string): string {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `ORD-${date}-${orderId.replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  }

  private serializeOrder(order: OrderRecord, includeInternalNotes: boolean) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      refundStatus: order.refundStatus,
      currency: order.currency,
      customer: order.customerSnapshot,
      billingAddress: order.billingAddressSnapshot,
      shippingAddress: order.shippingAddressSnapshot,
      shippingMethod: order.shippingMethodSnapshot,
      invoiceInformation: order.invoiceInformation,
      customerNote: order.customerNote,
      cancellationReason: order.cancellationReason,
      cancelledAt: order.cancelledAt,
      inventoryReservationEnds: order.inventoryReservationEnds,
      items: order.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        productName: item.productName,
        productSlug: item.productSlug,
        variantName: item.variantName,
        sku: item.sku,
        imageUrl: item.imageUrl,
        unitPrice: item.unitPrice.toFixed(2),
        quantity: item.quantity,
        lineSubtotal: item.lineSubtotal.toFixed(2),
        lineDiscount: item.lineDiscount.toFixed(2),
        lineTax: item.lineTax.toFixed(2),
        lineTotal: item.lineTotal.toFixed(2),
      })),
      pricing: order.pricingSnapshot,
      totals: {
        subtotal: order.subtotal.toFixed(2),
        discountTotal: order.discountTotal.toFixed(2),
        shippingTotal: order.shippingTotal.toFixed(2),
        shippingDiscountTotal: order.shippingDiscountTotal.toFixed(2),
        taxTotal: order.taxTotal.toFixed(2),
        grandTotal: order.grandTotal.toFixed(2),
      },
      internalNotes: includeInternalNotes ? order.internalNotes : undefined,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private toPaymentOrder(order: OrderRecord): PaymentOrderView {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      cartId: order.cartId,
      customerId: order.customerId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      refundStatus: order.refundStatus,
      amount: order.grandTotal.toFixed(2),
      currency: order.currency,
      customer: order.customerSnapshot,
      inventoryReservationIds: order.items.map((item) => item.inventoryReservationId),
    };
  }

  private toShippingOrder(order: OrderRecord): ShippingOrderView {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      cartId: order.cartId,
      customerId: order.customerId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      currency: order.currency,
      shippingCost: order.shippingTotal.minus(order.shippingDiscountTotal).toFixed(2),
      shippingMethodId: order.shippingMethodId,
      shippingMethod: order.shippingMethodSnapshot,
      shippingAddress: order.shippingAddressSnapshot,
    };
  }
}
