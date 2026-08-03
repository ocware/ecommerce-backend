import { BadRequestException, Injectable } from '@nestjs/common';
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentRefundStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { BestSellingProductsQueryDto } from '../dto/best-selling-products-query.dto';
import { LowStockReportQueryDto } from '../dto/low-stock-report-query.dto';
import { ReportRangeQueryDto } from '../dto/report-range-query.dto';

const salesPaymentStatuses = [
  OrderPaymentStatus.PAID,
  OrderPaymentStatus.PARTIALLY_REFUNDED,
  OrderPaymentStatus.REFUNDED,
];

type ReportRange = { from: Date; to: Date; currency?: string };
const reportTimezone = 'Asia/Tehran';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(query: ReportRangeQueryDto) {
    const range = this.resolveRange(query);
    const [orders, refunds] = await Promise.all([
      this.prisma.order.aggregate({
        where: this.salesOrderWhere(range),
        _count: true,
        _sum: { grandTotal: true },
      }),
      this.prisma.paymentRefund.aggregate({
        where: {
          status: PaymentRefundStatus.SUCCEEDED,
          completedAt: { gte: range.from, lte: range.to },
          currency: range.currency,
        },
        _sum: { amount: true },
      }),
    ]);
    const grossSales = orders._sum.grandTotal ?? new Prisma.Decimal(0);
    const refundTotal = refunds._sum.amount ?? new Prisma.Decimal(0);
    const orderCount = orders._count;

    return {
      range: this.serializeRange(range),
      orderCount,
      grossSales: grossSales.toFixed(2),
      refundTotal: refundTotal.toFixed(2),
      netSales: grossSales.minus(refundTotal).toFixed(2),
      averageOrderValue: orderCount ? grossSales.div(orderCount).toFixed(2) : '0.00',
    };
  }

  async getSalesByDate(query: ReportRangeQueryDto) {
    const range = this.resolveRange(query);
    const rows = await this.prisma.order.findMany({
      where: this.salesOrderWhere(range),
      select: { createdAt: true, grandTotal: true },
      orderBy: { createdAt: 'asc' },
    });
    const grouped = new Map<string, { orderCount: number; grossSales: Prisma.Decimal }>();
    for (const row of rows) {
      const date = this.tehranDateKey(row.createdAt);
      const current = grouped.get(date) ?? {
        orderCount: 0,
        grossSales: new Prisma.Decimal(0),
      };
      current.orderCount += 1;
      current.grossSales = current.grossSales.plus(row.grandTotal);
      grouped.set(date, current);
    }

    return {
      range: this.serializeRange(range),
      timezone: reportTimezone,
      points: this.calendarDates(range).map((date) => {
        const value = grouped.get(date);
        return {
          date,
          orderCount: value?.orderCount ?? 0,
          grossSales: value?.grossSales.toFixed(2) ?? '0.00',
        };
      }),
    };
  }

  async getBestSellingProducts(query: BestSellingProductsQueryDto) {
    const range = this.resolveRange(query);
    const items = await this.prisma.orderItem.findMany({
      where: { order: this.salesOrderWhere(range) },
      select: {
        variantId: true,
        productName: true,
        productSlug: true,
        variantName: true,
        sku: true,
        quantity: true,
        lineTotal: true,
        orderId: true,
      },
    });
    const grouped = new Map<
      string,
      {
        variantId: string;
        productName: string;
        productSlug: string;
        variantName: string;
        sku: string;
        quantitySold: number;
        revenue: Prisma.Decimal;
        orderIds: Set<string>;
      }
    >();
    for (const item of items) {
      const current = grouped.get(item.variantId) ?? {
        variantId: item.variantId,
        productName: item.productName,
        productSlug: item.productSlug,
        variantName: item.variantName,
        sku: item.sku,
        quantitySold: 0,
        revenue: new Prisma.Decimal(0),
        orderIds: new Set<string>(),
      };
      current.quantitySold += item.quantity;
      current.revenue = current.revenue.plus(item.lineTotal);
      current.orderIds.add(item.orderId);
      grouped.set(item.variantId, current);
    }

    const products = [...grouped.values()]
      .sort(
        (left, right) =>
          right.quantitySold - left.quantitySold || right.revenue.comparedTo(left.revenue),
      )
      .slice(0, query.limit)
      .map(({ orderIds, revenue, ...item }) => ({
        ...item,
        orderCount: orderIds.size,
        revenue: revenue.toFixed(2),
      }));
    return { range: this.serializeRange(range), products };
  }

  async getLowStockProducts(query: LowStockReportQueryDto) {
    const records = await this.prisma.inventoryItem.findMany({
      include: {
        variant: {
          select: {
            id: true,
            name: true,
            sku: true,
            product: { select: { id: true, name: true, slug: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const lowStock = records
      .map((record) => ({
        inventoryItemId: record.id,
        variantId: record.variantId,
        product: record.variant.product,
        variantName: record.variant.name,
        sku: record.variant.sku,
        currentStock: record.currentStock,
        reservedStock: record.reservedStock,
        availableStock: record.currentStock - record.reservedStock,
        lowStockThreshold: record.lowStockThreshold,
        updatedAt: record.updatedAt,
      }))
      .filter((record) => record.availableStock <= record.lowStockThreshold)
      .sort(
        (left, right) =>
          left.availableStock - right.availableStock ||
          left.product.name.localeCompare(right.product.name),
      );
    const start = (query.page - 1) * query.limit;
    return {
      items: lowStock.slice(start, start + query.limit),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: lowStock.length,
        pageCount: Math.ceil(lowStock.length / query.limit),
      },
    };
  }

  async getPaymentStatusSummary(query: ReportRangeQueryDto) {
    const range = this.resolveRange(query);
    const groups = await this.prisma.paymentAttempt.groupBy({
      by: ['status'],
      where: {
        createdAt: { gte: range.from, lte: range.to },
        currency: range.currency,
      },
      _count: true,
      _sum: { amount: true },
    });
    const byStatus = new Map(groups.map((group) => [group.status, group]));
    return {
      range: this.serializeRange(range),
      statuses: Object.values(PaymentAttemptStatus).map((status) => ({
        status,
        count: byStatus.get(status)?._count ?? 0,
        amount: byStatus.get(status)?._sum.amount?.toFixed(2) ?? '0.00',
      })),
    };
  }

  async getRefundSummary(query: ReportRangeQueryDto) {
    const range = this.resolveRange(query);
    const groups = await this.prisma.paymentRefund.groupBy({
      by: ['status'],
      where: {
        createdAt: { gte: range.from, lte: range.to },
        currency: range.currency,
      },
      _count: true,
      _sum: { amount: true },
    });
    const byStatus = new Map(groups.map((group) => [group.status, group]));
    return {
      range: this.serializeRange(range),
      statuses: Object.values(PaymentRefundStatus).map((status) => ({
        status,
        count: byStatus.get(status)?._count ?? 0,
        amount: byStatus.get(status)?._sum.amount?.toFixed(2) ?? '0.00',
      })),
    };
  }

  private salesOrderWhere(range: ReportRange): Prisma.OrderWhereInput {
    return {
      createdAt: { gte: range.from, lte: range.to },
      currency: range.currency,
      status: { not: OrderStatus.CANCELLED },
      paymentStatus: { in: salesPaymentStatuses },
    };
  }

  private resolveRange(query: ReportRangeQueryDto): ReportRange {
    const to = query.to ? this.parseBoundary(query.to, false) : new Date();
    const from = query.from
      ? this.parseBoundary(query.from, true)
      : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1_000);
    if (from > to) {
      throw new BadRequestException({
        code: 'INVALID_REPORT_RANGE',
        message: 'Report start time must not be after its end time.',
      });
    }
    if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1_000) {
      throw new BadRequestException({
        code: 'REPORT_RANGE_TOO_LARGE',
        message: 'Interactive reports are limited to 366 days.',
      });
    }
    return { from, to, currency: query.currency };
  }

  private serializeRange(range: ReportRange) {
    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      currency: range.currency ?? null,
    };
  }

  private calendarDates(range: ReportRange): string[] {
    const cursor = new Date(`${this.tehranDateKey(range.from)}T00:00:00.000Z`);
    const end = new Date(`${this.tehranDateKey(range.to)}T00:00:00.000Z`);
    const dates: string[] = [];
    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }

  private parseBoundary(value: string, startOfDay: boolean): Date {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(
        `${value}T${startOfDay ? '00:00:00.000' : '23:59:59.999'}+03:30`,
      );
    }
    return new Date(value);
  }

  private tehranDateKey(value: Date): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: reportTimezone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((entry) => entry.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
}
