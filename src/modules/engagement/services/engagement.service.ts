import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CustomerNotificationType,
  OrderFulfillmentStatus,
  OrderPaymentStatus,
  Prisma,
  ProductReviewStatus,
  ProductStatus,
  ProductVariantStatus,
} from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AuthenticatedCustomer } from '../../customers/types/authenticated-customer';
import { CreateProductReviewDto } from '../dto/create-product-review.dto';
import { ListReviewsQueryDto } from '../dto/list-reviews-query.dto';

const wishlistProductInclude = Prisma.validator<Prisma.ProductInclude>()({
  brand: true,
  categories: { include: { category: true } },
  images: { orderBy: { position: 'asc' }, take: 1 },
  variants: {
    where: { status: ProductVariantStatus.ACTIVE },
    orderBy: { position: 'asc' },
    include: { prices: true, inventory: true },
  },
});

@Injectable()
export class EngagementService {
  constructor(private readonly prisma: PrismaService) {}

  async listProductReviews(slug: string) {
    const product = await this.requireActiveProduct(slug);
    const [items, aggregate] = await Promise.all([
      this.prisma.productReview.findMany({
        where: { productId: product.id, status: ProductReviewStatus.APPROVED },
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.productReview.aggregate({
        where: { productId: product.id, status: ProductReviewStatus.APPROVED },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);
    return {
      items: items.map((review) => this.serializeReview(review)),
      summary: {
        average_rating: aggregate._avg.rating ?? 0,
        count: aggregate._count.rating,
      },
      can_review: false,
    };
  }

  async reviewEligibility(slug: string, customerId: string) {
    const product = await this.requireActiveProduct(slug);
    const [existing, purchase] = await Promise.all([
      this.prisma.productReview.findUnique({
        where: { productId_customerId: { productId: product.id, customerId } },
        select: { id: true, status: true },
      }),
      this.prisma.orderItem.findFirst({
        where: {
          variantId: { in: product.variants.map((variant) => variant.id) },
          order: {
            customerId,
            paymentStatus: {
              in: [OrderPaymentStatus.AUTHORIZED, OrderPaymentStatus.PAID],
            },
            fulfillmentStatus: OrderFulfillmentStatus.FULFILLED,
          },
        },
        select: { id: true },
      }),
    ]);
    return {
      can_review: Boolean(purchase) && !existing,
      verified_purchase: Boolean(purchase),
      existing_status: existing?.status ?? null,
    };
  }

  async createReview(
    slug: string,
    dto: CreateProductReviewDto,
    customer: AuthenticatedCustomer,
  ) {
    const product = await this.requireActiveProduct(slug);
    const eligibility = await this.reviewEligibility(slug, customer.id);
    if (!eligibility.verified_purchase) {
      throw new ConflictException({
        code: 'REVIEW_REQUIRES_VERIFIED_PURCHASE',
        message: 'Only customers with a delivered purchase can review this product.',
      });
    }
    if (!eligibility.can_review) {
      throw new ConflictException({
        code: 'PRODUCT_ALREADY_REVIEWED',
        message: 'This customer has already reviewed the product.',
      });
    }
    const review = await this.prisma.productReview.create({
      data: {
        productId: product.id,
        customerId: customer.id,
        rating: dto.rating,
        title: dto.title?.trim(),
        body: dto.body.trim(),
        verifiedPurchase: true,
      },
      include: { customer: { select: { name: true } } },
    });
    return this.serializeReview(review);
  }

  async listAdminReviews(query: ListReviewsQueryDto) {
    const where = { status: query.status };
    const skip = (query.page - 1) * query.limit;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.productReview.count({ where }),
      this.prisma.productReview.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, email: true, phone: true } },
          product: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
    ]);
    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pageCount: Math.ceil(total / query.limit),
      },
    };
  }

  async moderateReview(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    staffId: string,
  ) {
    await this.requireReview(id);
    return this.prisma.productReview.update({
      where: { id },
      data: { status, moderatedByStaffId: staffId, moderatedAt: new Date() },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        product: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async listWishlist(customerId: string) {
    const items = await this.prisma.wishlistItem.findMany({
      where: { customerId, product: { status: ProductStatus.ACTIVE } },
      include: { product: { include: wishlistProductInclude } },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((item) => ({
      id: item.id,
      product: this.withAvailability(item.product),
      addedAt: item.createdAt,
    }));
  }

  async checkWishlist(customerId: string, productId: string) {
    const count = await this.prisma.wishlistItem.count({ where: { customerId, productId } });
    return { in_wishlist: count > 0 };
  }

  async addWishlist(customerId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, status: ProductStatus.ACTIVE },
      include: wishlistProductInclude,
    });
    if (!product) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: 'The product was not found.',
      });
    }
    const item = await this.prisma.wishlistItem.upsert({
      where: { customerId_productId: { customerId, productId } },
      create: { customerId, productId },
      update: {},
    });
    return {
      id: item.id,
      product: this.withAvailability(product),
      addedAt: item.createdAt,
    };
  }

  async removeWishlist(customerId: string, productId: string) {
    await this.prisma.wishlistItem.deleteMany({ where: { customerId, productId } });
    return { ok: true };
  }

  async subscribeStock(customerId: string, variantId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        status: ProductVariantStatus.ACTIVE,
        product: { status: ProductStatus.ACTIVE },
      },
      include: { inventory: true, product: { select: { id: true, name: true, slug: true } } },
    });
    if (!variant) {
      throw new NotFoundException({
        code: 'VARIANT_NOT_FOUND',
        message: 'The product variant was not found.',
      });
    }
    const available =
      (variant.inventory?.currentStock ?? 0) - (variant.inventory?.reservedStock ?? 0);
    if (available > 0) {
      throw new ConflictException({
        code: 'VARIANT_ALREADY_IN_STOCK',
        message: 'The product variant is currently in stock.',
      });
    }
    return this.prisma.backInStockSubscription.upsert({
      where: { customerId_variantId: { customerId, variantId } },
      create: { customerId, variantId },
      update: { isActive: true, notifiedAt: null },
    });
  }

  async unsubscribeStock(customerId: string, variantId: string) {
    await this.prisma.backInStockSubscription.updateMany({
      where: { customerId, variantId },
      data: { isActive: false },
    });
    return { ok: true };
  }

  async listNotifications(customerId: string) {
    const notifications = await this.prisma.customerNotification.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return notifications.map((notification) => this.serializeNotification(notification));
  }

  async markNotificationRead(id: string, customerId: string) {
    const notification = await this.prisma.customerNotification.findUnique({ where: { id } });
    if (!notification) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOTIFICATION_NOT_FOUND',
        message: 'The notification was not found.',
      });
    }
    if (notification.customerId !== customerId) {
      throw new UnauthorizedException({
        code: 'NOTIFICATION_ACCESS_DENIED',
        message: 'The notification does not belong to this customer.',
      });
    }
    const updated = await this.prisma.customerNotification.update({
      where: { id },
      data: { readAt: notification.readAt ?? new Date() },
    });
    return this.serializeNotification(updated);
  }

  async markAllNotificationsRead(customerId: string) {
    await this.prisma.customerNotification.updateMany({
      where: { customerId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async createCustomerNotification(input: {
    customerId: string;
    type: CustomerNotificationType;
    eventName: string;
    eventId: string;
    title: string;
    body: string;
    href?: string;
  }) {
    return this.prisma.customerNotification.upsert({
      where: {
        customerId_eventName_eventId: {
          customerId: input.customerId,
          eventName: input.eventName,
          eventId: input.eventId,
        },
      },
      create: input,
      update: {},
    });
  }

  async notifyBackInStock(variantId: string) {
    const subscriptions = await this.prisma.backInStockSubscription.findMany({
      where: { variantId, isActive: true },
      include: {
        customer: { select: { id: true, email: true, phone: true } },
        variant: { include: { product: { select: { name: true, slug: true } } } },
      },
    });
    for (const subscription of subscriptions) {
      await this.createCustomerNotification({
        customerId: subscription.customerId,
        type: CustomerNotificationType.BACK_IN_STOCK,
        eventName: 'InventoryRestocked',
        eventId: subscription.id,
        title: 'موجود شد',
        body: `${subscription.variant.product.name} دوباره موجود شده است.`,
        href: `/shop/p/${subscription.variant.product.slug}`,
      });
    }
    if (subscriptions.length) {
      await this.prisma.backInStockSubscription.updateMany({
        where: { id: { in: subscriptions.map((subscription) => subscription.id) } },
        data: { isActive: false, notifiedAt: new Date() },
      });
    }
    return subscriptions;
  }

  private async requireActiveProduct(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: ProductStatus.ACTIVE },
      select: { id: true, variants: { select: { id: true } } },
    });
    if (!product) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: 'The product was not found.',
      });
    }
    return product;
  }

  private async requireReview(id: string) {
    const review = await this.prisma.productReview.findUnique({ where: { id } });
    if (!review) {
      throw new NotFoundException({
        code: 'REVIEW_NOT_FOUND',
        message: 'The review was not found.',
      });
    }
    return review;
  }

  private withAvailability<T extends { variants: Array<{ inventory: { currentStock: number; reservedStock: number } | null }> }>(
    product: T,
  ) {
    return {
      ...product,
      variants: product.variants.map((variant) => ({
        ...variant,
        availableStock: Math.max(
          0,
          (variant.inventory?.currentStock ?? 0) - (variant.inventory?.reservedStock ?? 0),
        ),
        inventory: undefined,
      })),
    };
  }

  private serializeReview(review: {
    id: string;
    rating: number;
    title: string | null;
    body: string;
    verifiedPurchase: boolean;
    createdAt: Date;
    customer: { name: string };
  }) {
    return {
      id: review.id,
      rating: review.rating,
      title: review.title,
      body: review.body,
      verified_purchase: review.verifiedPurchase,
      user_name: review.customer.name,
      created_at: review.createdAt,
    };
  }

  private serializeNotification(notification: {
    id: string;
    type: CustomerNotificationType;
    title: string;
    body: string;
    href: string | null;
    readAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: notification.id,
      type: notification.type.toLowerCase(),
      title: notification.title,
      body: notification.body,
      href: notification.href,
      read: Boolean(notification.readAt),
      created_at: notification.createdAt,
    };
  }
}
