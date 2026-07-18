import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DiscountMode, DiscountType, Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CatalogService } from '../../catalog/services/catalog.service';
import { CustomersService } from '../../customers/services/customers.service';
import {
  DiscountApplication,
  DiscountEvaluationContext,
  DiscountEvaluationItem,
  DiscountEvaluationResult,
  DiscountEvaluator,
} from '../contracts/discount-evaluator';
import { CreateDiscountDto } from '../dto/create-discount.dto';
import { ListDiscountsQueryDto } from '../dto/list-discounts-query.dto';
import { SetDiscountResourceIdsDto } from '../dto/set-discount-resource-ids.dto';
import { UpdateDiscountDto } from '../dto/update-discount.dto';

const ruleInclude = {
  products: true,
  categories: true,
  customers: true,
} satisfies Prisma.DiscountInclude;

type DiscountRule = Prisma.DiscountGetPayload<{ include: typeof ruleInclude }>;

type DiscountDefinition = {
  mode: DiscountMode;
  type: DiscountType;
  code: string | null;
  value: Prisma.Decimal | null;
  currency: string | null;
  minimumCartAmount: Prisma.Decimal | null;
  maximumDiscountAmount: Prisma.Decimal | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerUsageLimit: number | null;
};

@Injectable()
export class DiscountsService implements DiscountEvaluator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: CatalogService,
    private readonly customersService: CustomersService,
  ) {}

  async createDiscount(dto: CreateDiscountDto) {
    const definition = this.definitionFromCreate(dto);
    this.validateDefinition(definition);

    try {
      return await this.prisma.discount.create({
        data: {
          name: dto.name,
          description: dto.description,
          ...definition,
          priority: dto.priority ?? 0,
          isStackable: dto.isStackable ?? false,
          isActive: dto.isActive ?? true,
        },
        include: ruleInclude,
      });
    } catch (error) {
      this.throwCodeConflict(error);
    }
  }

  async updateDiscount(id: string, dto: UpdateDiscountDto) {
    const current = await this.requireDiscount(id);
    const definition = this.definitionFromUpdate(current, dto);
    this.validateDefinition(definition);

    try {
      return await this.prisma.discount.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          ...definition,
          priority: dto.priority,
          isStackable: dto.isStackable,
          isActive: dto.isActive,
        },
        include: ruleInclude,
      });
    } catch (error) {
      this.throwCodeConflict(error);
    }
  }

  async listDiscounts(query: ListDiscountsQueryDto) {
    const where: Prisma.DiscountWhereInput = {
      mode: query.mode,
      type: query.type,
      isActive: query.isActive,
    };
    const skip = (query.page - 1) * query.limit;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.discount.count({ where }),
      this.prisma.discount.findMany({
        where,
        include: {
          ...ruleInclude,
          _count: { select: { redemptions: true } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
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

  async findDiscount(id: string) {
    const discount = await this.prisma.discount.findUnique({
      where: { id },
      include: {
        ...ruleInclude,
        _count: { select: { redemptions: true } },
      },
    });
    if (!discount) {
      throw new NotFoundException({
        code: 'DISCOUNT_NOT_FOUND',
        message: 'Discount was not found.',
      });
    }
    return discount;
  }

  async setProductRestrictions(id: string, dto: SetDiscountResourceIdsDto) {
    await Promise.all([
      this.requireDiscount(id),
      this.catalogService.validateProductReferences(dto.ids),
    ]);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.discountProduct.deleteMany({ where: { discountId: id } });
      if (dto.ids.length) {
        await transaction.discountProduct.createMany({
          data: dto.ids.map((productId) => ({ discountId: id, productId })),
        });
      }
    });
    return this.findDiscount(id);
  }

  async setCategoryRestrictions(id: string, dto: SetDiscountResourceIdsDto) {
    await Promise.all([
      this.requireDiscount(id),
      this.catalogService.validateCategoryReferences(dto.ids),
    ]);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.discountCategory.deleteMany({ where: { discountId: id } });
      if (dto.ids.length) {
        await transaction.discountCategory.createMany({
          data: dto.ids.map((categoryId) => ({ discountId: id, categoryId })),
        });
      }
    });
    return this.findDiscount(id);
  }

  async setCustomerRestrictions(id: string, dto: SetDiscountResourceIdsDto) {
    await Promise.all([
      this.requireDiscount(id),
      this.customersService.validateCustomerReferences(dto.ids),
    ]);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.discountCustomer.deleteMany({ where: { discountId: id } });
      if (dto.ids.length) {
        await transaction.discountCustomer.createMany({
          data: dto.ids.map((customerId) => ({ discountId: id, customerId })),
        });
      }
    });
    return this.findDiscount(id);
  }

  async evaluate(context: DiscountEvaluationContext): Promise<DiscountEvaluationResult> {
    const automaticPromise = this.prisma.discount.findMany({
      where: { mode: DiscountMode.AUTOMATIC, isActive: true },
      include: ruleInclude,
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    const normalizedCode = context.code ? this.normalizeCode(context.code) : null;
    const couponPromise = normalizedCode
      ? this.prisma.discount.findUnique({
          where: { code: normalizedCode },
          include: ruleInclude,
        })
      : Promise.resolve(null);
    const [automaticRules, coupon] = await Promise.all([automaticPromise, couponPromise]);

    if (normalizedCode && (!coupon || coupon.mode !== DiscountMode.COUPON)) {
      throw new NotFoundException({
        code: 'INVALID_COUPON',
        message: 'The coupon code is invalid.',
      });
    }

    const rules = coupon ? [coupon, ...automaticRules] : automaticRules;
    const subtotal = new Prisma.Decimal(context.subtotal);
    let discountTotal = new Prisma.Decimal(0);
    let freeShipping = false;
    const applications: DiscountApplication[] = [];

    for (const rule of rules) {
      if (applications.length && !rule.isStackable) continue;
      const eligibleItems = await this.getEligibleItems(rule, context, subtotal);
      if (!eligibleItems) {
        if (rule.id === coupon?.id) {
          throw new ConflictException({
            code: 'COUPON_NOT_APPLICABLE',
            message: 'The coupon is not applicable to this cart.',
          });
        }
        continue;
      }

      const eligibleSubtotal = eligibleItems.reduce(
        (total, item) => total.plus(item.lineSubtotal),
        new Prisma.Decimal(0),
      );
      const remaining = Prisma.Decimal.max(subtotal.minus(discountTotal), 0);
      const amount = Prisma.Decimal.min(
        this.calculateRuleAmount(rule, eligibleSubtotal),
        remaining,
      );
      const appliesFreeShipping = rule.type === DiscountType.FREE_SHIPPING;
      if (amount.isZero() && !appliesFreeShipping) continue;

      applications.push({
        discountId: rule.id,
        code: rule.code ?? `AUTO-${rule.id}`,
        label: rule.name,
        type: rule.type,
        amount: amount.toFixed(2),
      });
      discountTotal = discountTotal.plus(amount);
      freeShipping ||= appliesFreeShipping;
      if (!rule.isStackable) break;
    }

    return {
      discountTotal: discountTotal.toFixed(2),
      shippingDiscountTotal: '0.00',
      freeShipping,
      applications,
    };
  }

  async recordRedemptions(
    orderReference: string,
    customerId: string | null,
    applications: DiscountApplication[],
  ) {
    const uniqueApplications = [
      ...new Map(applications.map((application) => [application.discountId, application])).values(),
    ];
    await this.prisma.$transaction(
      async (transaction) => {
        for (const application of uniqueApplications) {
          const existing = await transaction.discountRedemption.findUnique({
            where: {
              discountId_orderReference: {
                discountId: application.discountId,
                orderReference,
              },
            },
          });
          if (existing) continue;

          const discount = await transaction.discount.findUnique({
            where: { id: application.discountId },
          });
          if (!discount || !discount.isActive) {
            throw new ConflictException({
              code: 'DISCOUNT_NO_LONGER_AVAILABLE',
              message: 'A discount is no longer available.',
            });
          }
          if (discount.usageLimit !== null && discount.usageCount >= discount.usageLimit) {
            throw new ConflictException({
              code: 'DISCOUNT_USAGE_LIMIT_REACHED',
              message: 'A discount usage limit has been reached.',
            });
          }
          if (customerId && discount.perCustomerUsageLimit !== null) {
            const customerUsage = await transaction.discountRedemption.count({
              where: { discountId: discount.id, customerId },
            });
            if (customerUsage >= discount.perCustomerUsageLimit) {
              throw new ConflictException({
                code: 'CUSTOMER_DISCOUNT_USAGE_LIMIT_REACHED',
                message: 'The customer discount usage limit has been reached.',
              });
            }
          }

          await transaction.discountRedemption.create({
            data: {
              discountId: discount.id,
              customerId,
              orderReference,
              amount: new Prisma.Decimal(application.amount),
            },
          });
          await transaction.discount.update({
            where: { id: discount.id },
            data: { usageCount: { increment: 1 } },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { recorded: uniqueApplications.length };
  }

  async releaseRedemptions(orderReference: string): Promise<void> {
    await this.prisma.$transaction(
      async (transaction) => {
        const redemptions = await transaction.discountRedemption.findMany({
          where: { orderReference },
          select: { id: true, discountId: true },
        });
        if (!redemptions.length) return;

        await transaction.discountRedemption.deleteMany({ where: { orderReference } });
        for (const redemption of redemptions) {
          await transaction.discount.update({
            where: { id: redemption.discountId },
            data: { usageCount: { decrement: 1 } },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async getEligibleItems(
    rule: DiscountRule,
    context: DiscountEvaluationContext,
    subtotal: Prisma.Decimal,
  ): Promise<DiscountEvaluationItem[] | null> {
    const now = new Date();
    if (!rule.isActive) return null;
    if (rule.startsAt && rule.startsAt > now) return null;
    if (rule.endsAt && rule.endsAt < now) return null;
    if (rule.usageLimit !== null && rule.usageCount >= rule.usageLimit) return null;
    if (rule.currency && rule.currency !== context.currency) return null;
    if (rule.minimumCartAmount && subtotal.lessThan(rule.minimumCartAmount)) return null;
    if (
      rule.customers.length &&
      (!context.customerId ||
        !rule.customers.some((restriction) => restriction.customerId === context.customerId))
    ) {
      return null;
    }
    if (context.customerId && rule.perCustomerUsageLimit !== null) {
      const customerUsage = await this.prisma.discountRedemption.count({
        where: { discountId: rule.id, customerId: context.customerId },
      });
      if (customerUsage >= rule.perCustomerUsageLimit) return null;
    }

    const productIds = new Set(rule.products.map((restriction) => restriction.productId));
    const categoryIds = new Set(rule.categories.map((restriction) => restriction.categoryId));
    if (!productIds.size && !categoryIds.size) return context.items;
    const eligibleItems = context.items.filter(
      (item) =>
        productIds.has(item.productId) ||
        item.categoryIds.some((categoryId) => categoryIds.has(categoryId)),
    );
    return eligibleItems.length ? eligibleItems : null;
  }

  private calculateRuleAmount(rule: DiscountRule, eligibleSubtotal: Prisma.Decimal) {
    if (rule.type === DiscountType.FREE_SHIPPING) return new Prisma.Decimal(0);
    if (!rule.value) return new Prisma.Decimal(0);
    if (rule.type === DiscountType.FIXED_AMOUNT) {
      return Prisma.Decimal.min(rule.value, eligibleSubtotal);
    }
    let amount = eligibleSubtotal.mul(rule.value).div(100);
    if (rule.maximumDiscountAmount) {
      amount = Prisma.Decimal.min(amount, rule.maximumDiscountAmount);
    }
    return amount;
  }

  private definitionFromCreate(dto: CreateDiscountDto): DiscountDefinition {
    return {
      mode: dto.mode,
      type: dto.type,
      code: dto.mode === DiscountMode.COUPON ? this.normalizeCode(dto.code ?? '') : null,
      value: dto.value ? new Prisma.Decimal(dto.value) : null,
      currency: dto.currency ?? null,
      minimumCartAmount: dto.minimumCartAmount ? new Prisma.Decimal(dto.minimumCartAmount) : null,
      maximumDiscountAmount: dto.maximumDiscountAmount
        ? new Prisma.Decimal(dto.maximumDiscountAmount)
        : null,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      usageLimit: dto.usageLimit ?? null,
      usageCount: 0,
      perCustomerUsageLimit: dto.perCustomerUsageLimit ?? null,
    };
  }

  private definitionFromUpdate(
    current: Prisma.DiscountGetPayload<Record<string, never>>,
    dto: UpdateDiscountDto,
  ): DiscountDefinition {
    const mode = dto.mode ?? current.mode;
    return {
      mode,
      type: dto.type ?? current.type,
      code:
        mode === DiscountMode.COUPON ? this.normalizeCode(dto.code ?? current.code ?? '') : null,
      value: dto.value !== undefined ? new Prisma.Decimal(dto.value) : current.value,
      currency: dto.currency !== undefined ? dto.currency : current.currency,
      minimumCartAmount:
        dto.minimumCartAmount !== undefined
          ? new Prisma.Decimal(dto.minimumCartAmount)
          : current.minimumCartAmount,
      maximumDiscountAmount:
        dto.maximumDiscountAmount !== undefined
          ? new Prisma.Decimal(dto.maximumDiscountAmount)
          : current.maximumDiscountAmount,
      startsAt: dto.startsAt !== undefined ? new Date(dto.startsAt) : current.startsAt,
      endsAt: dto.endsAt !== undefined ? new Date(dto.endsAt) : current.endsAt,
      usageLimit: dto.usageLimit !== undefined ? dto.usageLimit : current.usageLimit,
      usageCount: current.usageCount,
      perCustomerUsageLimit:
        dto.perCustomerUsageLimit !== undefined
          ? dto.perCustomerUsageLimit
          : current.perCustomerUsageLimit,
    };
  }

  private validateDefinition(definition: DiscountDefinition): void {
    if (definition.mode === DiscountMode.COUPON && !definition.code) {
      throw this.invalidDefinition('Coupon discounts require a code.');
    }
    if (definition.mode === DiscountMode.AUTOMATIC && definition.code) {
      throw this.invalidDefinition('Automatic discounts cannot have a coupon code.');
    }
    if (definition.type === DiscountType.FREE_SHIPPING && definition.value) {
      throw this.invalidDefinition('Free-shipping discounts cannot have a value.');
    }
    if (definition.type !== DiscountType.FREE_SHIPPING && !definition.value) {
      throw this.invalidDefinition('Percentage and fixed discounts require a value.');
    }
    if (definition.value?.isNegative() || definition.value?.isZero()) {
      throw this.invalidDefinition('Discount value must be greater than zero.');
    }
    if (definition.type === DiscountType.PERCENTAGE && definition.value?.greaterThan(100)) {
      throw this.invalidDefinition('Percentage discount cannot exceed 100.');
    }
    if (definition.type === DiscountType.FIXED_AMOUNT && !definition.currency) {
      throw this.invalidDefinition('Fixed discounts require a currency.');
    }
    if (
      definition.minimumCartAmount?.isNegative() ||
      definition.maximumDiscountAmount?.isNegative()
    ) {
      throw this.invalidDefinition('Discount amount constraints cannot be negative.');
    }
    if (definition.maximumDiscountAmount && definition.type !== DiscountType.PERCENTAGE) {
      throw this.invalidDefinition('Maximum discount amount applies only to percentage discounts.');
    }
    if (definition.startsAt && definition.endsAt && definition.startsAt >= definition.endsAt) {
      throw this.invalidDefinition('Discount end date must be after its start date.');
    }
    if (definition.usageLimit !== null && definition.usageLimit < definition.usageCount) {
      throw this.invalidDefinition('Usage limit cannot be lower than current usage.');
    }
  }

  private async requireDiscount(id: string) {
    const discount = await this.prisma.discount.findUnique({ where: { id } });
    if (!discount) {
      throw new NotFoundException({
        code: 'DISCOUNT_NOT_FOUND',
        message: 'Discount was not found.',
      });
    }
    return discount;
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private invalidDefinition(message: string): BadRequestException {
    return new BadRequestException({ code: 'INVALID_DISCOUNT_DEFINITION', message });
  }

  private throwCodeConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException({
        code: 'DISCOUNT_CODE_CONFLICT',
        message: 'This discount code is already in use.',
      });
    }
    throw error;
  }
}
