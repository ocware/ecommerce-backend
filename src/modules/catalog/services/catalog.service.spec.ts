import { ProductStatus, ProductVariantStatus } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  const product = {
    id: 'product-id',
    brandId: null,
    name: 'Classic T-Shirt',
    slug: 'classic-t-shirt',
    description: null,
    shortDescription: null,
    status: ProductStatus.DRAFT,
    seoTitle: null,
    seoDescription: null,
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const variant = {
    id: 'variant-id',
    productId: product.id,
    name: 'Black / Medium',
    sku: 'TSHIRT-BLK-M',
    barcode: null,
    status: ProductVariantStatus.ACTIVE,
    isDefault: false,
    position: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const prisma = {
    product: {
      findUnique: jest.fn(),
    },
    productVariant: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    productPrice: {
      upsert: jest.fn(),
    },
    category: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new CatalogService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.product.findUnique.mockResolvedValue(product);
    prisma.productVariant.findUnique.mockResolvedValue(variant);
  });

  it('normalizes SKU values before creating variants', async () => {
    prisma.productVariant.create.mockResolvedValue(variant);

    await service.createVariant(product.id, {
      name: variant.name,
      sku: '  tshirt-blk-m  ',
    });

    expect(prisma.productVariant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sku: 'TSHIRT-BLK-M' }) as Record<string, unknown>,
    });
  });

  it('rejects compare-at prices lower than the selling price', async () => {
    await expect(
      service.upsertPrice(variant.id, {
        currency: 'USD',
        amount: '20.00',
        compareAtAmount: '19.99',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_PRODUCT_PRICE' }) as Record<
        string,
        unknown
      >,
    });

    expect(prisma.productPrice.upsert).not.toHaveBeenCalled();
  });

  it('upserts one fixed-precision price per variant and currency', async () => {
    prisma.productPrice.upsert.mockResolvedValue({ id: 'price-id' });

    await service.upsertPrice(variant.id, {
      currency: 'USD',
      amount: '19.99',
      compareAtAmount: '24.99',
    });

    expect(prisma.productPrice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          variantId_currency: {
            variantId: variant.id,
            currency: 'USD',
          },
        },
      }),
    );
  });

  describe('updateCategory', () => {
    const root = {
      id: 'cat-root',
      parentId: null as string | null,
      name: 'Root',
      slug: 'root',
    };
    const child = {
      id: 'cat-child',
      parentId: 'cat-root',
      name: 'Child',
      slug: 'child',
    };

    it('rejects nesting a category under itself', async () => {
      prisma.category.findUnique.mockResolvedValue(root);

      await expect(
        service.updateCategory(root.id, { parentId: root.id }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_CATEGORY_PARENT' }) as Record<
          string,
          unknown
        >,
      });
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('rejects nesting a category under one of its descendants', async () => {
      prisma.category.findUnique.mockImplementation(
        ({ where, select }: { where: { id: string }; select?: { parentId?: boolean } }) => {
          if (where.id === root.id) {
            return Promise.resolve(select?.parentId ? { parentId: root.parentId } : root);
          }
          if (where.id === child.id) {
            return Promise.resolve(select?.parentId ? { parentId: child.parentId } : child);
          }
          return Promise.resolve(null);
        },
      );

      await expect(
        service.updateCategory(root.id, { parentId: child.id }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_CATEGORY_PARENT' }) as Record<
          string,
          unknown
        >,
      });
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('clears parentId when null is provided', async () => {
      prisma.category.findUnique.mockResolvedValue(child);
      prisma.category.update.mockResolvedValue({ ...child, parentId: null });

      await service.updateCategory(child.id, { parentId: null });

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: child.id },
        data: { parentId: null },
      });
    });
  });
});
