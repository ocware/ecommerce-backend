import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Cart, CartStatus, Prisma, ProductStatus, ProductVariantStatus } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CatalogService } from '../../catalog/services/catalog.service';
import {
  DISCOUNT_EVALUATOR,
  DiscountEvaluationItem,
  DiscountEvaluator,
} from '../../discounts/contracts/discount-evaluator';
import { InventoryService } from '../../inventory/services/inventory.service';
import { AuthenticatedCustomer } from '../../customers/types/authenticated-customer';
import { AddCartItemDto } from '../dto/add-cart-item.dto';
import { ApplyDiscountCodeDto } from '../dto/apply-discount-code.dto';
import { CreateCartDto } from '../dto/create-cart.dto';
import { MergeGuestCartDto } from '../dto/merge-guest-cart.dto';
import { UpdateCartItemDto } from '../dto/update-cart-item.dto';
import { CartTokenService } from './cart-token.service';

type CartVariant = Awaited<ReturnType<CatalogService['getCartVariant']>>;

@Injectable()
export class CartService {
  private readonly guestLifetimeMs = 7 * 24 * 60 * 60 * 1000;
  private readonly customerLifetimeMs = 30 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: CatalogService,
    private readonly inventoryService: InventoryService,
    private readonly tokenService: CartTokenService,
    @Inject(DISCOUNT_EVALUATOR)
    private readonly discountEvaluator: DiscountEvaluator,
  ) {}

  async createGuestCart(dto: CreateCartDto) {
    const guestToken = this.tokenService.createGuestToken();
    const cart = await this.prisma.cart.create({
      data: {
        currency: dto.currency,
        guestTokenHash: guestToken.tokenHash,
        expiresAt: this.expirationFromNow(this.guestLifetimeMs),
      },
    });
    return { ...(await this.calculateCart(cart)), guestToken: guestToken.token };
  }

  async createCustomerCart(dto: CreateCartDto, customer: AuthenticatedCustomer) {
    const existing = await this.prisma.cart.findFirst({
      where: {
        customerId: customer.id,
        currency: dto.currency,
        status: CartStatus.ACTIVE,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing && existing.expiresAt > new Date()) {
      return this.calculateCart(existing);
    }
    if (existing) {
      await this.prisma.cart.update({
        where: { id: existing.id },
        data: { status: CartStatus.EXPIRED },
      });
    }

    try {
      const cart = await this.prisma.cart.create({
        data: {
          customerId: customer.id,
          currency: dto.currency,
          expiresAt: this.expirationFromNow(this.customerLifetimeMs),
        },
      });
      return this.calculateCart(cart);
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const concurrent = await this.prisma.cart.findFirst({
          where: {
            customerId: customer.id,
            currency: dto.currency,
            status: CartStatus.ACTIVE,
          },
        });
        if (concurrent) return this.calculateCart(concurrent);
      }
      throw error;
    }
  }

  async getGuestCart(id: string, guestToken?: string) {
    const cart = await this.requireActiveCart(id);
    this.assertGuestAccess(cart, guestToken);
    return this.calculateCart(cart);
  }

  async getCustomerCart(id: string, customer: AuthenticatedCustomer) {
    const cart = await this.requireActiveCart(id);
    this.assertCustomerAccess(cart, customer.id);
    return this.calculateCart(cart);
  }

  async addGuestItem(id: string, dto: AddCartItemDto, guestToken?: string) {
    const cart = await this.requireActiveCart(id);
    this.assertGuestAccess(cart, guestToken);
    return this.addItem(cart, dto);
  }

  async addCustomerItem(id: string, dto: AddCartItemDto, customer: AuthenticatedCustomer) {
    const cart = await this.requireActiveCart(id);
    this.assertCustomerAccess(cart, customer.id);
    return this.addItem(cart, dto);
  }

  async updateGuestItem(id: string, itemId: string, dto: UpdateCartItemDto, guestToken?: string) {
    const cart = await this.requireActiveCart(id);
    this.assertGuestAccess(cart, guestToken);
    return this.updateItem(cart, itemId, dto);
  }

  async updateCustomerItem(
    id: string,
    itemId: string,
    dto: UpdateCartItemDto,
    customer: AuthenticatedCustomer,
  ) {
    const cart = await this.requireActiveCart(id);
    this.assertCustomerAccess(cart, customer.id);
    return this.updateItem(cart, itemId, dto);
  }

  async removeGuestItem(id: string, itemId: string, guestToken?: string) {
    const cart = await this.requireActiveCart(id);
    this.assertGuestAccess(cart, guestToken);
    return this.removeItem(cart, itemId);
  }

  async removeCustomerItem(id: string, itemId: string, customer: AuthenticatedCustomer) {
    const cart = await this.requireActiveCart(id);
    this.assertCustomerAccess(cart, customer.id);
    return this.removeItem(cart, itemId);
  }

  async applyGuestDiscount(id: string, dto: ApplyDiscountCodeDto, guestToken?: string) {
    const cart = await this.requireActiveCart(id);
    this.assertGuestAccess(cart, guestToken);
    return this.applyDiscount(cart, dto.code);
  }

  async removeGuestDiscount(id: string, guestToken?: string) {
    const cart = await this.requireActiveCart(id);
    this.assertGuestAccess(cart, guestToken);
    return this.removeDiscount(cart);
  }

  async applyCustomerDiscount(
    id: string,
    dto: ApplyDiscountCodeDto,
    customer: AuthenticatedCustomer,
  ) {
    const cart = await this.requireActiveCart(id);
    this.assertCustomerAccess(cart, customer.id);
    return this.applyDiscount(cart, dto.code);
  }

  async removeCustomerDiscount(id: string, customer: AuthenticatedCustomer) {
    const cart = await this.requireActiveCart(id);
    this.assertCustomerAccess(cart, customer.id);
    return this.removeDiscount(cart);
  }

  async mergeGuestCart(
    customerCartId: string,
    dto: MergeGuestCartDto,
    customer: AuthenticatedCustomer,
  ) {
    const [customerCart, guestCart] = await Promise.all([
      this.requireActiveCart(customerCartId),
      this.requireActiveCart(dto.guestCartId),
    ]);
    this.assertCustomerAccess(customerCart, customer.id);
    this.assertGuestAccess(guestCart, dto.guestToken);
    if (customerCart.currency !== guestCart.currency) {
      throw new ConflictException({
        code: 'CART_CURRENCY_MISMATCH',
        message: 'Guest and customer carts must use the same currency.',
      });
    }

    const [customerItems, guestItems] = await Promise.all([
      this.prisma.cartItem.findMany({ where: { cartId: customerCart.id } }),
      this.prisma.cartItem.findMany({ where: { cartId: guestCart.id } }),
    ]);
    const quantities = new Map(customerItems.map((item) => [item.variantId, item.quantity]));
    for (const item of guestItems) {
      quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
    }
    await Promise.all(
      [...quantities].map(([variantId, quantity]) =>
        this.validateCartQuantity(variantId, customerCart.currency, quantity),
      ),
    );

    const updated = await this.prisma.$transaction(
      async (transaction) => {
        for (const [variantId, quantity] of quantities) {
          await transaction.cartItem.upsert({
            where: { cartId_variantId: { cartId: customerCart.id, variantId } },
            create: { cartId: customerCart.id, variantId, quantity },
            update: { quantity },
          });
        }
        await transaction.cart.update({
          where: { id: guestCart.id },
          data: { status: CartStatus.CONVERTED },
        });
        return transaction.cart.update({
          where: { id: customerCart.id },
          data: { expiresAt: this.expirationFromNow(this.customerLifetimeMs) },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.calculateCart(updated);
  }

  async expireCarts(limit = 500) {
    const carts = await this.prisma.cart.findMany({
      where: { status: CartStatus.ACTIVE, expiresAt: { lte: new Date() } },
      select: { id: true },
      orderBy: { expiresAt: 'asc' },
      take: limit,
    });
    let expired = 0;
    if (carts.length) {
      const result = await this.prisma.cart.updateMany({
        where: { id: { in: carts.map((cart) => cart.id) }, status: CartStatus.ACTIVE },
        data: { status: CartStatus.EXPIRED },
      });
      expired = result.count;
    }
    return { examined: carts.length, expired };
  }

  private async addItem(cart: Cart, dto: AddCartItemDto) {
    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId: dto.variantId } },
    });
    const quantity = (existing?.quantity ?? 0) + dto.quantity;
    await this.validateCartQuantity(dto.variantId, cart.currency, quantity);
    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: dto.variantId } },
      create: { cartId: cart.id, variantId: dto.variantId, quantity },
      update: { quantity },
    });
    return this.calculateCart(await this.touchCart(cart));
  }

  private async updateItem(cart: Cart, itemId: string, dto: UpdateCartItemDto) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
    });
    if (!item) {
      throw new NotFoundException({
        code: 'CART_ITEM_NOT_FOUND',
        message: 'Cart item was not found.',
      });
    }
    await this.validateCartQuantity(item.variantId, cart.currency, dto.quantity);
    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity: dto.quantity },
    });
    return this.calculateCart(await this.touchCart(cart));
  }

  private async removeItem(cart: Cart, itemId: string) {
    const result = await this.prisma.cartItem.deleteMany({
      where: { id: itemId, cartId: cart.id },
    });
    if (result.count !== 1) {
      throw new NotFoundException({
        code: 'CART_ITEM_NOT_FOUND',
        message: 'Cart item was not found.',
      });
    }
    return this.calculateCart(await this.touchCart(cart));
  }

  private async applyDiscount(cart: Cart, code: string) {
    const normalizedCode = code.trim().toUpperCase();
    await this.calculateCart({ ...cart, discountCode: normalizedCode });
    const updated = await this.prisma.cart.update({
      where: { id: cart.id },
      data: {
        discountCode: normalizedCode,
        expiresAt: this.expirationFromNow(
          cart.customerId ? this.customerLifetimeMs : this.guestLifetimeMs,
        ),
      },
    });
    return this.calculateCart(updated);
  }

  private async removeDiscount(cart: Cart) {
    const updated = await this.prisma.cart.update({
      where: { id: cart.id },
      data: {
        discountCode: null,
        expiresAt: this.expirationFromNow(
          cart.customerId ? this.customerLifetimeMs : this.guestLifetimeMs,
        ),
      },
    });
    return this.calculateCart(updated);
  }

  private async validateCartQuantity(variantId: string, currency: string, quantity: number) {
    const [variant, availability] = await Promise.all([
      this.catalogService.getCartVariant(variantId, currency),
      this.inventoryService.getAvailability(variantId),
    ]);
    if (
      variant.status !== ProductVariantStatus.ACTIVE ||
      variant.product.status !== ProductStatus.ACTIVE
    ) {
      throw new ConflictException({
        code: 'PRODUCT_NOT_AVAILABLE',
        message: 'This product is not currently available for purchase.',
        details: { variantId },
      });
    }
    if (!variant.prices[0]) {
      throw new ConflictException({
        code: 'PRODUCT_PRICE_UNAVAILABLE',
        message: 'This product has no price in the cart currency.',
        details: { variantId, currency },
      });
    }
    if (availability.availableStock < quantity) {
      throw new ConflictException({
        code: 'INSUFFICIENT_STOCK',
        message: 'The requested quantity is unavailable.',
        details: { variantId, requested: quantity, available: availability.availableStock },
      });
    }
  }

  private async calculateCart(cart: Cart) {
    const cartItems = await this.prisma.cartItem.findMany({
      where: { cartId: cart.id },
      orderBy: { createdAt: 'asc' },
    });
    const items = await Promise.all(
      cartItems.map(async (item) => {
        const [variant, availability] = await Promise.all([
          this.catalogService.getCartVariant(item.variantId, cart.currency),
          this.getAvailabilityOrUnavailable(item.variantId),
        ]);
        return this.calculateItem(item, variant, availability.availableStock, cart.currency);
      }),
    );
    const subtotal = items.reduce(
      (total, item) => total.plus(item.lineSubtotal ?? 0),
      new Prisma.Decimal(0),
    );
    const discountItems: DiscountEvaluationItem[] = items
      .filter(
        (item): item is typeof item & { unitPrice: string; lineSubtotal: string } =>
          item.unitPrice !== null && item.lineSubtotal !== null,
      )
      .map((item) => ({
        variantId: item.variantId,
        productId: item.product.id,
        categoryIds: item.product.categoryIds,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineSubtotal: item.lineSubtotal,
      }));
    const discount = await this.discountEvaluator.evaluate({
      currency: cart.currency,
      customerId: cart.customerId,
      code: cart.discountCode,
      items: discountItems,
      subtotal: subtotal.toFixed(2),
    });
    const discountTotal = new Prisma.Decimal(discount.discountTotal);
    if (discountTotal.isNegative() || discountTotal.greaterThan(subtotal)) {
      throw new InternalServerErrorException({
        code: 'INVALID_DISCOUNT_RESULT',
        message: 'The discount evaluator returned an invalid total.',
      });
    }
    const shippingTotal = new Prisma.Decimal(0);
    const taxTotal = new Prisma.Decimal(0);
    const grandTotal = subtotal.minus(discountTotal).plus(shippingTotal).plus(taxTotal);

    return {
      id: cart.id,
      customerId: cart.customerId,
      currency: cart.currency,
      status: cart.status,
      discountCode: cart.discountCode,
      expiresAt: cart.expiresAt,
      items,
      canCheckout: items.length > 0 && items.every((item) => item.isAvailable),
      discounts: discount.applications,
      freeShipping: discount.freeShipping,
      totals: {
        subtotal: subtotal.toFixed(2),
        discountTotal: discountTotal.toFixed(2),
        shippingTotal: shippingTotal.toFixed(2),
        taxTotal: taxTotal.toFixed(2),
        grandTotal: grandTotal.toFixed(2),
      },
    };
  }

  private calculateItem(
    item: { id: string; variantId: string; quantity: number },
    variant: CartVariant,
    availableStock: number,
    currency: string,
  ) {
    const price = variant.prices[0];
    const issues: string[] = [];
    if (
      variant.status !== ProductVariantStatus.ACTIVE ||
      variant.product.status !== ProductStatus.ACTIVE
    ) {
      issues.push('PRODUCT_NOT_AVAILABLE');
    }
    if (!price) issues.push('PRODUCT_PRICE_UNAVAILABLE');
    if (availableStock < item.quantity) issues.push('INSUFFICIENT_STOCK');
    const lineSubtotal = price ? price.amount.mul(item.quantity).toFixed(2) : null;

    return {
      id: item.id,
      variantId: item.variantId,
      quantity: item.quantity,
      product: {
        id: variant.product.id,
        name: variant.product.name,
        slug: variant.product.slug,
        categoryIds: variant.product.categories.map((category) => category.categoryId),
      },
      variant: { name: variant.name, sku: variant.sku },
      image: variant.images[0]?.url ?? variant.product.images[0]?.url ?? null,
      currency,
      unitPrice: price?.amount.toFixed(2) ?? null,
      compareAtPrice: price?.compareAtAmount?.toFixed(2) ?? null,
      lineSubtotal,
      availableStock,
      isAvailable: issues.length === 0,
      issues,
    };
  }

  private async getAvailabilityOrUnavailable(variantId: string) {
    try {
      return await this.inventoryService.getAvailability(variantId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return { variantId, availableStock: 0, inStock: false, lowStock: true };
      }
      throw error;
    }
  }

  private async requireActiveCart(id: string): Promise<Cart> {
    const cart = await this.prisma.cart.findUnique({ where: { id } });
    if (!cart) {
      throw new NotFoundException({ code: 'CART_NOT_FOUND', message: 'Cart was not found.' });
    }
    if (cart.status !== CartStatus.ACTIVE) {
      throw new GoneException({
        code: 'CART_NOT_ACTIVE',
        message: 'This cart is no longer active.',
      });
    }
    if (cart.expiresAt <= new Date()) {
      await this.prisma.cart.update({
        where: { id: cart.id },
        data: { status: CartStatus.EXPIRED },
      });
      throw new GoneException({ code: 'CART_EXPIRED', message: 'This cart has expired.' });
    }
    return cart;
  }

  private assertGuestAccess(cart: Cart, guestToken?: string): void {
    if (
      cart.customerId ||
      !guestToken ||
      !cart.guestTokenHash ||
      !this.tokenService.matches(guestToken, cart.guestTokenHash)
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_GUEST_CART_TOKEN',
        message: 'A valid guest cart token is required.',
      });
    }
  }

  private assertCustomerAccess(cart: Cart, customerId: string): void {
    if (cart.customerId !== customerId) {
      throw new UnauthorizedException({
        code: 'CART_ACCESS_DENIED',
        message: 'This cart does not belong to the authenticated customer.',
      });
    }
  }

  private touchCart(cart: Cart): Promise<Cart> {
    return this.prisma.cart.update({
      where: { id: cart.id },
      data: {
        expiresAt: this.expirationFromNow(
          cart.customerId ? this.customerLifetimeMs : this.guestLifetimeMs,
        ),
      },
    });
  }

  private expirationFromNow(lifetimeMs: number): Date {
    return new Date(Date.now() + lifetimeMs);
  }

  private isUniqueConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
