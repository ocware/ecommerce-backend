import { ProductStatus, ProductVariantStatus } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ProductSort } from '../dto/list-products-query.dto';
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
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
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

  describe('createConfiguredProduct', () => {
    const configuredDto = {
      name: 'Atomic Ring',
      slug: 'atomic-ring',
      status: ProductStatus.ACTIVE,
      images: [
        {
          url: 'https://cdn.example.com/gallery.jpg',
          altText: 'Atomic Ring',
          position: 2,
        },
      ],
      variants: [
        {
          name: 'Size 60',
          sku: 'atomic-60',
          price: '1250000',
          stock: 3,
          attributes: {},
          image: {
            url: 'https://cdn.example.com/variant.jpg',
            altText: 'Atomic Ring size 60',
          },
        },
      ],
    };

    it('persists gallery and variant images inside the product transaction', async () => {
      const transaction = {
        shopSettings: {
          findUnique: jest.fn().mockResolvedValue({ lowStockThreshold: 2 }),
        },
        product: {
          create: jest.fn().mockResolvedValue(product),
        },
        productVariant: {
          create: jest.fn().mockResolvedValue(variant),
        },
        productImage: {
          create: jest.fn().mockResolvedValue({ id: 'variant-image-id' }),
        },
        productAttribute: { create: jest.fn() },
        productAttributeValue: { create: jest.fn() },
        variantAttributeValue: { createMany: jest.fn() },
      };
      prisma.$transaction.mockImplementation((operation: (tx: unknown) => unknown) =>
        Promise.resolve(operation(transaction)),
      );

      await service.createConfiguredProduct(configuredDto);

      expect(transaction.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          images: {
            create: [
              {
                url: configuredDto.images[0].url,
                altText: configuredDto.images[0].altText,
                position: 2,
              },
            ],
          },
        }) as Record<string, unknown>,
      });
      expect(transaction.productVariant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sku: 'ATOMIC-60' }) as Record<string, unknown>,
      });
      expect(transaction.productImage.create).toHaveBeenCalledWith({
        data: {
          productId: product.id,
          variantId: variant.id,
          url: configuredDto.variants[0].image.url,
          altText: configuredDto.variants[0].image.altText,
          position: 0,
        },
      });
    });

    it('does not return a product when a nested configured write fails', async () => {
      const transaction = {
        shopSettings: {
          findUnique: jest.fn().mockResolvedValue({ lowStockThreshold: 2 }),
        },
        product: {
          create: jest.fn().mockResolvedValue(product),
        },
        productVariant: {
          create: jest.fn().mockRejectedValue(new Error('variant write failed')),
        },
        productImage: { create: jest.fn() },
        productAttribute: { create: jest.fn() },
        productAttributeValue: { create: jest.fn() },
        variantAttributeValue: { createMany: jest.fn() },
      };
      prisma.$transaction.mockImplementation((operation: (tx: unknown) => unknown) =>
        Promise.resolve(operation(transaction)),
      );

      await expect(service.createConfiguredProduct(configuredDto)).rejects.toThrow(
        'variant write failed',
      );
      expect(prisma.product.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('archiveProduct', () => {
    it('archives an existing product without deleting the row', async () => {
      prisma.product.findUnique.mockResolvedValue(product);
      prisma.product.update.mockResolvedValue({ ...product, status: ProductStatus.ARCHIVED });

      await expect(service.archiveProduct(product.id)).resolves.toEqual({
        id: product.id,
        deleted: true,
      });

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: product.id },
        data: { status: ProductStatus.ARCHIVED },
      });
    });

    it('is idempotent when the product is already archived', async () => {
      prisma.product.findUnique.mockResolvedValue({
        ...product,
        status: ProductStatus.ARCHIVED,
      });
      prisma.product.update.mockResolvedValue({ ...product, status: ProductStatus.ARCHIVED });

      await expect(service.archiveProduct(product.id)).resolves.toEqual({
        id: product.id,
        deleted: true,
      });

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: product.id },
        data: { status: ProductStatus.ARCHIVED },
      });
    });

    it('rejects archiving a missing product', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.archiveProduct('missing-id')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PRODUCT_NOT_FOUND' }) as Record<string, unknown>,
      });

      expect(prisma.product.update).not.toHaveBeenCalled();
    });
  });

  describe('listAdminProducts', () => {
    it('excludes archived products by default', async () => {
      prisma.$transaction.mockImplementation(async (operations: Promise<unknown>[]) =>
        Promise.all(operations),
      );
      prisma.product.count.mockResolvedValue(0);
      prisma.product.findMany.mockResolvedValue([]);

      await service.listAdminProducts({ page: 1, limit: 20, sort: ProductSort.Newest });

      expect(prisma.product.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          status: { not: ProductStatus.ARCHIVED },
        }) as Record<string, unknown>,
      });
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { not: ProductStatus.ARCHIVED },
          }) as Record<string, unknown>,
        }),
      );
    });

    it('allows explicit archived filtering', async () => {
      prisma.$transaction.mockImplementation(async (operations: Promise<unknown>[]) =>
        Promise.all(operations),
      );
      prisma.product.count.mockResolvedValue(0);
      prisma.product.findMany.mockResolvedValue([]);

      await service.listAdminProducts({
        page: 1,
        limit: 20,
        sort: ProductSort.Newest,
        status: ProductStatus.ARCHIVED,
      });

      expect(prisma.product.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          status: ProductStatus.ARCHIVED,
        }) as Record<string, unknown>,
      });
    });
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

      await expect(service.updateCategory(root.id, { parentId: root.id })).rejects.toMatchObject({
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

      await expect(service.updateCategory(root.id, { parentId: child.id })).rejects.toMatchObject({
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
