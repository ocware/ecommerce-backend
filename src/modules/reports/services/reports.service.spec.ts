import { BadRequestException } from '@nestjs/common';
import { PaymentAttemptStatus, PaymentRefundStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  const prisma = {
    order: {
      aggregate: jest.fn(() => ({
        _count: 2,
        _sum: { grandTotal: new Prisma.Decimal('300.00') },
      })),
      findMany: jest.fn(() => [] as Array<{ createdAt: Date; grandTotal: Prisma.Decimal }>),
    },
    orderItem: {
      findMany: jest.fn(
        () =>
          [] as Array<{
            variantId: string;
            productName: string;
            productSlug: string;
            variantName: string;
            sku: string;
            quantity: number;
            lineTotal: Prisma.Decimal;
            orderId: string;
          }>,
      ),
    },
    inventoryItem: { findMany: jest.fn(() => [] as unknown[]) },
    paymentAttempt: { groupBy: jest.fn(() => [] as unknown[]) },
    paymentRefund: {
      aggregate: jest.fn(() => ({ _sum: { amount: new Prisma.Decimal('50.00') } })),
      groupBy: jest.fn(() => [] as unknown[]),
    },
  };
  const service = new ReportsService(prisma as unknown as PrismaService);
  const range = {
    from: '2026-07-01T00:00:00.000Z',
    to: '2026-07-03T23:59:59.999Z',
    currency: 'USD',
  };

  beforeEach(() => jest.clearAllMocks());

  it('calculates order count, gross sales, refunds, net sales, and AOV', async () => {
    await expect(service.getOverview(range)).resolves.toEqual({
      range,
      orderCount: 2,
      grossSales: '300.00',
      refundTotal: '50.00',
      netSales: '250.00',
      averageOrderValue: '150.00',
    });
  });

  it('groups paid sales into a complete Tehran daily series', async () => {
    prisma.order.findMany.mockReturnValueOnce([
      { createdAt: new Date('2026-07-01T10:00:00.000Z'), grandTotal: new Prisma.Decimal('25') },
      { createdAt: new Date('2026-07-01T15:00:00.000Z'), grandTotal: new Prisma.Decimal('15') },
      { createdAt: new Date('2026-07-03T12:00:00.000Z'), grandTotal: new Prisma.Decimal('10') },
    ]);

    const result = await service.getSalesByDate(range);

    expect(result.timezone).toBe('Asia/Tehran');
    expect(result.points).toEqual([
      { date: '2026-07-01', orderCount: 2, grossSales: '40.00' },
      { date: '2026-07-02', orderCount: 0, grossSales: '0.00' },
      { date: '2026-07-03', orderCount: 1, grossSales: '10.00' },
      { date: '2026-07-04', orderCount: 0, grossSales: '0.00' },
    ]);
  });

  it('ranks immutable order-item snapshots by quantity and revenue', async () => {
    prisma.orderItem.findMany.mockReturnValueOnce([
      {
        variantId: 'variant-a',
        productName: 'Shirt',
        productSlug: 'shirt',
        variantName: 'Blue',
        sku: 'SHIRT-BLUE',
        quantity: 2,
        lineTotal: new Prisma.Decimal('40'),
        orderId: 'order-1',
      },
      {
        variantId: 'variant-a',
        productName: 'Shirt',
        productSlug: 'shirt',
        variantName: 'Blue',
        sku: 'SHIRT-BLUE',
        quantity: 3,
        lineTotal: new Prisma.Decimal('60'),
        orderId: 'order-2',
      },
      {
        variantId: 'variant-b',
        productName: 'Hat',
        productSlug: 'hat',
        variantName: 'Default',
        sku: 'HAT',
        quantity: 4,
        lineTotal: new Prisma.Decimal('120'),
        orderId: 'order-1',
      },
    ]);

    const result = await service.getBestSellingProducts({ ...range, limit: 10 });

    expect(result.products[0]).toEqual(
      expect.objectContaining({
        variantId: 'variant-a',
        quantitySold: 5,
        revenue: '100.00',
        orderCount: 2,
      }),
    );
  });

  it('filters current inventory by available stock and paginates it', async () => {
    prisma.inventoryItem.findMany.mockReturnValueOnce([
      inventoryRecord('inventory-low', 5, 4, 2, 'Low product'),
      inventoryRecord('inventory-ok', 8, 2, 2, 'Available product'),
    ]);

    const result = await service.getLowStockProducts({ page: 1, limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({ inventoryItemId: 'inventory-low', availableStock: 1 }),
    );
    expect(result.pagination.total).toBe(1);
  });

  it('normalizes payment and refund summaries with zero-value statuses', async () => {
    prisma.paymentAttempt.groupBy.mockReturnValueOnce([
      {
        status: PaymentAttemptStatus.SUCCEEDED,
        _count: 3,
        _sum: { amount: new Prisma.Decimal('90') },
      },
    ]);
    prisma.paymentRefund.groupBy.mockReturnValueOnce([
      {
        status: PaymentRefundStatus.SUCCEEDED,
        _count: 1,
        _sum: { amount: new Prisma.Decimal('10') },
      },
    ]);

    const payments = await service.getPaymentStatusSummary(range);
    const refunds = await service.getRefundSummary(range);

    expect(payments.statuses).toContainEqual({
      status: PaymentAttemptStatus.SUCCEEDED,
      count: 3,
      amount: '90.00',
    });
    expect(payments.statuses).toContainEqual({
      status: PaymentAttemptStatus.FAILED,
      count: 0,
      amount: '0.00',
    });
    expect(refunds.statuses).toContainEqual({
      status: PaymentRefundStatus.SUCCEEDED,
      count: 1,
      amount: '10.00',
    });
  });

  it('rejects inverted or excessively large interactive ranges', async () => {
    await expect(
      service.getOverview({
        from: '2026-07-04T00:00:00.000Z',
        to: '2026-07-03T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getOverview({
        from: '2024-01-01T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.aggregate).not.toHaveBeenCalled();
  });
});

function inventoryRecord(
  id: string,
  currentStock: number,
  reservedStock: number,
  lowStockThreshold: number,
  productName: string,
) {
  return {
    id,
    variantId: `variant-${id}`,
    currentStock,
    reservedStock,
    lowStockThreshold,
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    variant: {
      id: `variant-${id}`,
      name: 'Default',
      sku: `SKU-${id}`,
      product: { id: `product-${id}`, name: productName, slug: productName.toLowerCase() },
    },
  };
}
