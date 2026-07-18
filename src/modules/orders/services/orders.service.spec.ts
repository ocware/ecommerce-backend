import { ConflictException } from '@nestjs/common';
import {
  DiscountType,
  OrderFulfillmentStatus,
  OrderPaymentStatus,
  OrderRefundStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CartService, CheckoutCartView } from '../../cart/services/cart.service';
import { DiscountsService } from '../../discounts/services/discounts.service';
import { InventoryService } from '../../inventory/services/inventory.service';
import { OrderEventPublisher } from './order-event-publisher.service';
import { OrdersService } from './orders.service';

describe('OrdersService checkout orchestration', () => {
  const cartId = '11111111-1111-4111-8111-111111111111';
  const customerId = '22222222-2222-4222-8222-222222222222';
  const variantId = '33333333-3333-4333-8333-333333333333';
  const reservationId = '44444444-4444-4444-8444-444444444444';
  const now = new Date();
  const cart: CheckoutCartView = {
    id: cartId,
    customerId,
    currency: 'USD',
    discountCode: 'SAVE10',
    expiresAt: new Date(Date.now() + 30 * 60_000),
    items: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        variantId,
        quantity: 2,
        product: { id: 'product-id', name: 'Shirt', slug: 'shirt', categoryIds: [] },
        variant: { name: 'Blue / M', sku: 'SHIRT-BLU-M' },
        image: 'https://example.test/shirt.jpg',
        unitPrice: '25.00',
        lineSubtotal: '50.00',
      },
    ],
    discounts: [
      {
        discountId: 'discount-id',
        code: 'SAVE10',
        label: 'Save ten',
        type: DiscountType.FIXED_AMOUNT,
        amount: '10.00',
      },
    ],
    freeShipping: false,
    totals: {
      subtotal: '50.00',
      discountTotal: '10.00',
      shippingTotal: '0.00',
      taxTotal: '0.00',
      grandTotal: '40.00',
    },
  };
  const checkoutDto = {
    cartId,
    billingAddress: {
      fullName: 'Test Customer',
      phone: '+12025550123',
      country: 'US',
      province: 'CA',
      city: 'Los Angeles',
      line1: '1 Test Street',
    },
    shippingAddress: {
      fullName: 'Test Customer',
      phone: '+12025550123',
      country: 'US',
      province: 'CA',
      city: 'Los Angeles',
      line1: '1 Test Street',
    },
    customerNote: 'Leave at reception.',
  };
  const customer = {
    id: customerId,
    name: 'Test Customer',
    email: 'customer@example.test',
    phone: null,
    sessionId: 'session-id',
  };
  const prisma = {
    order: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    orderInternalNote: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const cartService = {
    prepareCheckout: jest.fn(),
    verifyCheckoutAccess: jest.fn(),
    markConverted: jest.fn(),
  };
  const inventoryService = {
    reserveStock: jest.fn(),
    releaseReservation: jest.fn(),
  };
  const discountsService = {
    recordRedemptions: jest.fn(),
    releaseRedemptions: jest.fn(),
  };
  const eventPublisher = { publish: jest.fn() };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    cartService as unknown as CartService,
    inventoryService as unknown as InventoryService,
    discountsService as unknown as DiscountsService,
    eventPublisher as unknown as OrderEventPublisher,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.order.findUnique.mockResolvedValue(null);
    cartService.prepareCheckout.mockResolvedValue(cart);
    cartService.markConverted.mockResolvedValue(undefined);
    inventoryService.reserveStock.mockResolvedValue({ id: reservationId });
    inventoryService.releaseReservation.mockResolvedValue({ status: 'RELEASED' });
    discountsService.recordRedemptions.mockResolvedValue({ recorded: 1 });
    discountsService.releaseRedemptions.mockResolvedValue(undefined);
    prisma.order.create.mockResolvedValue(makeOrder());
  });

  it('reserves inventory and creates immutable purchase snapshots from recalculated cart data', async () => {
    const result = await service.checkoutCustomer(checkoutDto, customer);

    expect(inventoryService.reserveStock).toHaveBeenCalledWith(
      expect.objectContaining({ variantId, quantity: 2 }),
    );
    expect(discountsService.recordRedemptions).toHaveBeenCalledWith(
      expect.any(String),
      customerId,
      cart.discounts,
    );
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cartId,
          customerId,
          customerSnapshot: expect.objectContaining({ email: customer.email }) as Record<
            string,
            unknown
          >,
          billingAddressSnapshot: checkoutDto.billingAddress,
          pricingSnapshot: expect.objectContaining({ totals: cart.totals }) as Record<
            string,
            unknown
          >,
          items: {
            create: [
              expect.objectContaining({
                productName: 'Shirt',
                variantName: 'Blue / M',
                sku: 'SHIRT-BLU-M',
                quantity: 2,
                inventoryReservationId: reservationId,
              }),
            ],
          },
        }) as Record<string, unknown>,
      }),
    );
    expect(cartService.markConverted).toHaveBeenCalledWith(cartId);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'OrderCreated', orderId: result.id }),
    );
    expect(result.totals.grandTotal).toBe('40.00');
  });

  it('releases earlier reservations when a later cart item cannot be reserved', async () => {
    cartService.prepareCheckout.mockResolvedValue({
      ...cart,
      items: [
        ...cart.items,
        {
          ...cart.items[0],
          id: '66666666-6666-4666-8666-666666666666',
          variantId: '77777777-7777-4777-8777-777777777777',
        },
      ],
    });
    inventoryService.reserveStock
      .mockResolvedValueOnce({ id: reservationId })
      .mockRejectedValueOnce(new ConflictException('insufficient stock'));

    await expect(service.checkoutCustomer(checkoutDto, customer)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(inventoryService.releaseReservation).toHaveBeenCalledWith(reservationId);
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(cartService.markConverted).not.toHaveBeenCalled();
  });

  it('releases inventory and publishes OrderCancelled for customer cancellation', async () => {
    const pending = makeOrder();
    const cancelled = makeOrder({
      status: OrderStatus.CANCELLED,
      fulfillmentStatus: OrderFulfillmentStatus.CANCELLED,
      cancellationReason: 'Changed my mind',
    });
    prisma.order.findUnique.mockReset();
    prisma.order.findUnique.mockResolvedValueOnce(pending).mockResolvedValueOnce(cancelled);
    prisma.order.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.cancelCustomerOrder(
      pending.id,
      { reason: 'Changed my mind' },
      customer,
    );

    expect(inventoryService.releaseReservation).toHaveBeenCalledWith(reservationId);
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OrderStatus.CANCELLED }) as Record<string, unknown>,
      }),
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'OrderCancelled', reason: 'Changed my mind' }),
    );
    expect(result.status).toBe(OrderStatus.CANCELLED);
  });

  function makeOrder(overrides: Record<string, unknown> = {}) {
    return {
      id: '88888888-8888-4888-8888-888888888888',
      orderNumber: 'ORD-20260718-8888888888',
      cartId,
      customerId,
      status: OrderStatus.PENDING,
      paymentStatus: OrderPaymentStatus.PENDING,
      fulfillmentStatus: OrderFulfillmentStatus.UNFULFILLED,
      refundStatus: OrderRefundStatus.NONE,
      currency: 'USD',
      subtotal: new Prisma.Decimal(50),
      discountTotal: new Prisma.Decimal(10),
      shippingTotal: new Prisma.Decimal(0),
      shippingDiscountTotal: new Prisma.Decimal(0),
      taxTotal: new Prisma.Decimal(0),
      grandTotal: new Prisma.Decimal(40),
      customerSnapshot: { name: customer.name, email: customer.email },
      billingAddressSnapshot: checkoutDto.billingAddress,
      shippingAddressSnapshot: checkoutDto.shippingAddress,
      pricingSnapshot: { totals: cart.totals },
      invoiceInformation: null,
      customerNote: checkoutDto.customerNote,
      cancellationReason: null,
      cancelledAt: null,
      cancelledByStaffUserId: null,
      inventoryReservationEnds: cart.expiresAt,
      createdAt: now,
      updatedAt: now,
      items: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          orderId: '88888888-8888-4888-8888-888888888888',
          variantId,
          inventoryReservationId: reservationId,
          productName: 'Shirt',
          productSlug: 'shirt',
          variantName: 'Blue / M',
          sku: 'SHIRT-BLU-M',
          imageUrl: 'https://example.test/shirt.jpg',
          unitPrice: new Prisma.Decimal(25),
          quantity: 2,
          lineSubtotal: new Prisma.Decimal(50),
          lineDiscount: new Prisma.Decimal(10),
          lineTax: new Prisma.Decimal(0),
          lineTotal: new Prisma.Decimal(40),
          createdAt: now,
        },
      ],
      internalNotes: [],
      ...overrides,
    };
  }
});
