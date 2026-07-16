import { ConflictException } from '@nestjs/common';
import { DiscountMode, DiscountType, Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CatalogService } from '../../catalog/services/catalog.service';
import { CustomersService } from '../../customers/services/customers.service';
import { DiscountEvaluationContext } from '../contracts/discount-evaluator';
import { DiscountsService } from './discounts.service';

async function expectCouponNotApplicable(evaluation: Promise<unknown>) {
  try {
    await evaluation;
    throw new Error('Expected coupon evaluation to fail.');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'COUPON_NOT_APPLICABLE',
    });
  }
}

describe('DiscountsService', () => {
  const prisma = {
    discount: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    discountRedemption: {
      count: jest.fn(),
    },
  };
  const service = new DiscountsService(
    prisma as unknown as PrismaService,
    {} as CatalogService,
    {} as CustomersService,
  );
  const context: DiscountEvaluationContext = {
    currency: 'USD',
    customerId: 'customer-1',
    code: null,
    subtotal: '150.00',
    items: [
      {
        variantId: 'variant-1',
        productId: 'product-1',
        categoryIds: ['category-1'],
        quantity: 1,
        unitPrice: '100.00',
        lineSubtotal: '100.00',
      },
      {
        variantId: 'variant-2',
        productId: 'product-2',
        categoryIds: ['category-2'],
        quantity: 1,
        unitPrice: '50.00',
        lineSubtotal: '50.00',
      },
    ],
  };

  const rule = (overrides: Record<string, unknown> = {}) => ({
    id: 'discount-1',
    name: 'Test discount',
    description: null,
    code: null,
    mode: DiscountMode.AUTOMATIC,
    type: DiscountType.PERCENTAGE,
    value: new Prisma.Decimal(10),
    currency: null,
    minimumCartAmount: null,
    maximumDiscountAmount: null,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    usageCount: 0,
    perCustomerUsageLimit: null,
    priority: 0,
    isStackable: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    products: [],
    categories: [],
    customers: [],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.discount.findMany.mockResolvedValue([]);
    prisma.discount.findUnique.mockResolvedValue(null);
    prisma.discountRedemption.count.mockResolvedValue(0);
  });

  it('caps a percentage coupon and applies it only to restricted products', async () => {
    prisma.discount.findUnique.mockResolvedValue(
      rule({
        code: 'SAVE20',
        mode: DiscountMode.COUPON,
        value: new Prisma.Decimal(20),
        minimumCartAmount: new Prisma.Decimal(100),
        maximumDiscountAmount: new Prisma.Decimal(15),
        products: [{ productId: 'product-1' }],
      }),
    );

    const result = await service.evaluate({ ...context, code: ' save20 ' });

    expect(prisma.discount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'SAVE20' } }),
    );
    expect(result.discountTotal).toBe('15.00');
    expect(result.applications).toEqual([
      expect.objectContaining({ code: 'SAVE20', amount: '15.00' }),
    ]);
  });

  it('combines stackable automatic fixed and free-shipping discounts', async () => {
    prisma.discount.findMany.mockResolvedValue([
      rule({
        id: 'fixed-discount',
        name: 'Twelve off',
        type: DiscountType.FIXED_AMOUNT,
        value: new Prisma.Decimal(12),
        currency: 'USD',
        isStackable: true,
      }),
      rule({
        id: 'shipping-discount',
        name: 'Free shipping',
        type: DiscountType.FREE_SHIPPING,
        value: null,
        isStackable: true,
      }),
    ]);

    const result = await service.evaluate(context);

    expect(result.discountTotal).toBe('12.00');
    expect(result.freeShipping).toBe(true);
    expect(result.applications).toHaveLength(2);
  });

  it('rejects expired coupons', async () => {
    prisma.discount.findUnique.mockResolvedValue(
      rule({
        code: 'EXPIRED',
        mode: DiscountMode.COUPON,
        endsAt: new Date(Date.now() - 60_000),
      }),
    );

    await expectCouponNotApplicable(service.evaluate({ ...context, code: 'EXPIRED' }));
  });

  it('enforces customer restrictions and per-customer usage limits', async () => {
    prisma.discount.findUnique.mockResolvedValue(
      rule({
        code: 'CUSTOMER',
        mode: DiscountMode.COUPON,
        customers: [{ customerId: 'customer-1' }],
        perCustomerUsageLimit: 1,
      }),
    );
    prisma.discountRedemption.count.mockResolvedValue(1);

    await expectCouponNotApplicable(service.evaluate({ ...context, code: 'CUSTOMER' }));
  });
});
