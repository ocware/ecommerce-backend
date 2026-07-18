import {
  CartStatus,
  DiscountType,
  Prisma,
  ProductStatus,
  ProductVariantStatus,
} from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CatalogService } from '../../catalog/services/catalog.service';
import { InventoryService } from '../../inventory/services/inventory.service';
import { SettingsService } from '../../settings/services/settings.service';
import { CartTokenService } from './cart-token.service';
import { CartService } from './cart.service';

describe('CartService', () => {
  const cartId = '11111111-1111-4111-8111-111111111111';
  const variantId = '22222222-2222-4222-8222-222222222222';
  const tokenService = new CartTokenService();
  const guest = tokenService.createGuestToken();
  const settings = {
    get: jest.fn(() => Promise.resolve({ currency: 'USD', taxEnabled: false, taxRate: '0.0000' })),
  };
  const cart = {
    id: cartId,
    customerId: null,
    guestTokenHash: guest.tokenHash,
    currency: 'USD',
    status: CartStatus.ACTIVE,
    discountCode: null,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const item = {
    id: '33333333-3333-4333-8333-333333333333',
    cartId,
    variantId,
    quantity: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const cartVariant = {
    id: variantId,
    name: 'Black / Medium',
    sku: 'TSHIRT-BLK-M',
    status: ProductVariantStatus.ACTIVE,
    product: {
      id: 'product-id',
      name: 'Classic T-Shirt',
      slug: 'classic-t-shirt',
      status: ProductStatus.ACTIVE,
      categories: [{ categoryId: 'category-id' }],
      images: [],
    },
    images: [{ url: 'https://example.com/shirt.jpg' }],
    prices: [
      {
        currency: 'USD',
        amount: new Prisma.Decimal('19.99'),
        compareAtAmount: new Prisma.Decimal('24.99'),
      },
    ],
  };

  it('recalculates current prices, discounts, and database-configured tax', async () => {
    settings.get.mockResolvedValueOnce({
      currency: 'USD',
      taxEnabled: true,
      taxRate: '8.2500',
    });
    const prisma = {
      cart: { findUnique: jest.fn(() => cart) },
      cartItem: { findMany: jest.fn(() => [item]) },
    };
    const catalog = { getCartVariant: jest.fn(() => cartVariant) };
    const inventory = {
      getAvailability: jest.fn(() => ({
        variantId,
        availableStock: 5,
        inStock: true,
        lowStock: false,
      })),
    };
    const discounts = {
      evaluate: jest.fn(() =>
        Promise.resolve({
          discountTotal: '5.00',
          shippingDiscountTotal: '0.00',
          freeShipping: false,
          applications: [
            {
              discountId: 'discount-id',
              code: 'AUTO',
              label: 'Automatic discount',
              type: DiscountType.FIXED_AMOUNT,
              amount: '5.00',
            },
          ],
        }),
      ),
    };
    const service = new CartService(
      prisma as unknown as PrismaService,
      catalog as unknown as CatalogService,
      inventory as unknown as InventoryService,
      tokenService,
      discounts,
      settings as unknown as SettingsService,
    );

    const result = await service.getGuestCart(cartId, guest.token);

    expect(result.items[0].unitPrice).toBe('19.99');
    expect(result.totals).toEqual({
      subtotal: '39.98',
      discountTotal: '5.00',
      shippingTotal: '0.00',
      taxTotal: '2.89',
      grandTotal: '37.87',
    });
    expect(result.canCheckout).toBe(true);
    expect(discounts.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ subtotal: '39.98', currency: 'USD' }),
    );
  });

  it('rejects cart quantities above currently available stock', async () => {
    const prisma = {
      cart: { findUnique: jest.fn(() => cart) },
      cartItem: {
        findUnique: jest.fn(() => null),
        upsert: jest.fn(),
      },
    };
    const catalog = { getCartVariant: jest.fn(() => cartVariant) };
    const inventory = {
      getAvailability: jest.fn(() => ({
        variantId,
        availableStock: 1,
        inStock: true,
        lowStock: true,
      })),
    };
    const service = new CartService(
      prisma as unknown as PrismaService,
      catalog as unknown as CatalogService,
      inventory as unknown as InventoryService,
      tokenService,
      { evaluate: jest.fn() },
      settings as unknown as SettingsService,
    );

    await expect(
      service.addGuestItem(cartId, { variantId, quantity: 2 }, guest.token),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INSUFFICIENT_STOCK' }) as Record<string, unknown>,
    });
    expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
  });

  it('rejects a product that becomes unavailable before it is added to the cart', async () => {
    const prisma = {
      cart: { findUnique: jest.fn(() => cart) },
      cartItem: { findUnique: jest.fn(() => null), upsert: jest.fn() },
    };
    const catalog = {
      getCartVariant: jest.fn(() => ({
        ...cartVariant,
        product: { ...cartVariant.product, status: ProductStatus.ARCHIVED },
      })),
    };
    const inventory = {
      getAvailability: jest.fn(() => ({
        variantId,
        availableStock: 10,
        inStock: true,
        lowStock: false,
      })),
    };
    const service = new CartService(
      prisma as unknown as PrismaService,
      catalog as unknown as CatalogService,
      inventory as unknown as InventoryService,
      tokenService,
      { evaluate: jest.fn() },
      settings as unknown as SettingsService,
    );

    await expect(
      service.addGuestItem(cartId, { variantId, quantity: 1 }, guest.token),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PRODUCT_NOT_AVAILABLE' }) as Record<
        string,
        unknown
      >,
    });
    expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
  });

  it('marks expired carts before rejecting access', async () => {
    const expiredCart = { ...cart, expiresAt: new Date(Date.now() - 1) };
    const prisma = {
      cart: {
        findUnique: jest.fn(() => expiredCart),
        update: jest.fn(() => ({ ...expiredCart, status: CartStatus.EXPIRED })),
      },
    };
    const service = new CartService(
      prisma as unknown as PrismaService,
      {} as CatalogService,
      {} as InventoryService,
      tokenService,
      { evaluate: jest.fn() },
      settings as unknown as SettingsService,
    );

    await expect(service.getGuestCart(cartId, guest.token)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CART_EXPIRED' }) as Record<string, unknown>,
    });
    expect(prisma.cart.update).toHaveBeenCalledWith({
      where: { id: cartId },
      data: { status: CartStatus.EXPIRED },
    });
  });
});
