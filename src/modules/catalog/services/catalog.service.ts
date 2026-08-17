import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus, ProductVariantStatus } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CreateAttributeValueDto } from '../dto/create-attribute-value.dto';
import { CreateBrandDto } from '../dto/create-brand.dto';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { CreateConfiguredProductDto } from '../dto/create-configured-product.dto';
import { CreateProductAttributeDto } from '../dto/create-product-attribute.dto';
import { CreateProductCollectionDto } from '../dto/create-product-collection.dto';
import { CreateProductImageDto } from '../dto/create-product-image.dto';
import { CreateProductVariantDto } from '../dto/create-product-variant.dto';
import { CreateProductDto } from '../dto/create-product.dto';
import { ListProductsQueryDto, ProductSort } from '../dto/list-products-query.dto';
import { SetResourceIdsDto } from '../dto/set-resource-ids.dto';
import { SetVariantAttributeValuesDto } from '../dto/set-variant-attribute-values.dto';
import { UpdateBrandDto } from '../dto/update-brand.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { UpdateProductCollectionDto } from '../dto/update-product-collection.dto';
import { UpdateProductVariantDto } from '../dto/update-product-variant.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { UpsertProductPriceDto } from '../dto/upsert-product-price.dto';
import {
  type FlatCategoryNode,
  buildChildrenMap,
  buildStoreCategoryTree,
  buildSubtreeProductCounts,
  getAncestorIds,
  getDescendantIds,
  getPublicCategoryIds,
  sortCategoriesForAdminTree,
} from '../utils/category-hierarchy.util';

const adminProductInclude = {
  brand: true,
  primaryCategory: true,
  categories: {
    include: {
      category: true,
    },
  },
  variants: {
    where: {
      status: ProductVariantStatus.ACTIVE,
    },
    orderBy: {
      position: 'asc' as const,
    },
    include: {
      prices: true,
      inventory: true,
      images: { orderBy: { position: 'asc' as const } },
      attributeValues: {
        include: {
          attributeValue: {
            include: {
              attribute: true,
            },
          },
        },
      },
    },
  },
  attributes: {
    orderBy: {
      position: 'asc' as const,
    },
    include: {
      values: {
        orderBy: {
          position: 'asc' as const,
        },
      },
    },
  },
  images: {
    orderBy: {
      position: 'asc' as const,
    },
  },
  collections: {
    include: {
      collection: true,
    },
  },
  relatedProducts: {
    orderBy: {
      position: 'asc' as const,
    },
    include: {
      relatedProduct: true,
    },
  },
} satisfies Prisma.ProductInclude;

const publicProductListSelect = {
  id: true,
  brandId: true,
  name: true,
  slug: true,
  description: true,
  shortDescription: true,
  details: true,
  status: true,
  seoTitle: true,
  seoDescription: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  brand: true,
  categories: {
    where: { category: { isActive: true } },
    include: { category: true },
  },
  images: { orderBy: { position: 'asc' as const }, take: 1 },
  variants: {
    where: { status: ProductVariantStatus.ACTIVE },
    orderBy: { position: 'asc' as const },
    include: {
      prices: true,
      inventory: true,
    },
  },
} satisfies Prisma.ProductSelect;

const publicProductDetailSelect = {
  ...publicProductListSelect,
  images: { orderBy: { position: 'asc' as const } },
  attributes: {
    orderBy: { position: 'asc' as const },
    include: { values: { orderBy: { position: 'asc' as const } } },
  },
  variants: {
    where: { status: ProductVariantStatus.ACTIVE },
    orderBy: { position: 'asc' as const },
    include: {
      prices: true,
      inventory: true,
      images: { orderBy: { position: 'asc' as const } },
      attributeValues: {
        include: { attributeValue: { include: { attribute: true } } },
      },
    },
  },
  collections: {
    where: { collection: { isActive: true } },
    include: { collection: true },
  },
  relatedProducts: {
    where: { relatedProduct: { status: ProductStatus.ACTIVE } },
    orderBy: { position: 'asc' as const },
    include: {
      relatedProduct: {
        select: {
          id: true,
          brandId: true,
          name: true,
          slug: true,
          description: true,
          shortDescription: true,
          details: true,
          status: true,
          seoTitle: true,
          seoDescription: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
          images: { orderBy: { position: 'asc' as const }, take: 1 },
        },
      },
    },
  },
} satisfies Prisma.ProductSelect;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async createProduct(dto: CreateProductDto) {
    if (dto.brandId) {
      await this.requireBrand(dto.brandId);
    }
    if (dto.primaryCategoryId) {
      await this.requireCategory(dto.primaryCategoryId);
    }

    return this.withUniqueConflict(
      () =>
        this.prisma.product.create({
          data: {
            name: dto.name,
            slug: dto.slug,
            description: dto.description,
            shortDescription: dto.shortDescription,
            status: dto.status,
            brandId: dto.brandId,
            primaryCategoryId: dto.primaryCategoryId,
            details: dto.details as Prisma.InputJsonValue | undefined,
            seoTitle: dto.seoTitle,
            seoDescription: dto.seoDescription,
            publishedAt: dto.status === ProductStatus.ACTIVE ? new Date() : undefined,
          },
          include: adminProductInclude,
        }),
      'PRODUCT_CONFLICT',
      'A product with this slug already exists.',
    );
  }

  async createConfiguredProduct(dto: CreateConfiguredProductDto) {
    if (dto.brandId) await this.requireBrand(dto.brandId);
    if (dto.categoryId) await this.requireCategory(dto.categoryId);
    try {
      const productId = await this.prisma.$transaction(async (transaction) => {
        const settings = await transaction.shopSettings.findUnique({
          where: { id: 'default' },
          select: { lowStockThreshold: true },
        });
        const product = await transaction.product.create({
          data: {
            name: dto.name.trim(),
            slug: dto.slug,
            description: dto.description?.trim(),
            details: dto.details as Prisma.InputJsonValue | undefined,
            status: dto.status,
            brandId: dto.brandId,
            primaryCategoryId: dto.categoryId ?? undefined,
            publishedAt: dto.status === ProductStatus.ACTIVE ? new Date() : undefined,
            categories: dto.categoryId
              ? { create: { categoryId: dto.categoryId } }
              : undefined,
          },
        });
        const attributeValues = new Map<string, Map<string, string>>();
        const definitions = new Map<string, Set<string>>();
        for (const variant of dto.variants) {
          for (const [name, value] of Object.entries(variant.attributes)) {
            if (!definitions.has(name)) definitions.set(name, new Set());
            definitions.get(name)!.add(value);
          }
        }
        let attributePosition = 0;
        for (const [name, values] of definitions) {
          const attribute = await transaction.productAttribute.create({
            data: { productId: product.id, name, position: attributePosition++ },
          });
          const valueMap = new Map<string, string>();
          let valuePosition = 0;
          for (const value of values) {
            const created = await transaction.productAttributeValue.create({
              data: { attributeId: attribute.id, value, position: valuePosition++ },
            });
            valueMap.set(value, created.id);
          }
          attributeValues.set(name, valueMap);
        }
        for (const [position, row] of dto.variants.entries()) {
          const variant = await transaction.productVariant.create({
            data: {
              productId: product.id,
              name: row.name.trim(),
              sku: this.normalizeSku(row.sku),
              status: ProductVariantStatus.ACTIVE,
              isDefault: position === 0,
              position,
              prices: {
                create: {
                  currency: 'IRR',
                  amount: new Prisma.Decimal(row.price),
                  compareAtAmount: row.compareAtPrice
                    ? new Prisma.Decimal(row.compareAtPrice)
                    : undefined,
                },
              },
              inventory: {
                create: {
                  currentStock: row.stock,
                  lowStockThreshold: settings?.lowStockThreshold ?? 0,
                  movements: {
                    create: {
                      type: 'INITIALIZED',
                      currentStockDelta: row.stock,
                      resultingCurrentStock: row.stock,
                      resultingReservedStock: 0,
                      reason: 'Inventory initialized with configured product.',
                    },
                  },
                },
              },
            },
          });
          const valueIds = Object.entries(row.attributes).map(([name, value]) =>
            attributeValues.get(name)!.get(value)!,
          );
          if (valueIds.length) {
            await transaction.variantAttributeValue.createMany({
              data: valueIds.map((attributeValueId) => ({
                variantId: variant.id,
                attributeValueId,
              })),
            });
          }
        }
        return product.id;
      });
      return this.findAdminProduct(productId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'CONFIGURED_PRODUCT_CONFLICT',
          message: 'The product slug or one of its SKUs already exists.',
        });
      }
      throw error;
    }
  }

  async getVariantReference(id: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id },
      select: {
        id: true,
        productId: true,
        name: true,
        sku: true,
        status: true,
      },
    });

    if (!variant) {
      throw this.notFound('VARIANT_NOT_FOUND', 'Product variant was not found.');
    }

    return variant;
  }

  getVariantReferences(ids: string[]) {
    return this.prisma.productVariant.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        productId: true,
        name: true,
        sku: true,
        status: true,
      },
    });
  }

  async getCartVariant(id: string, currency: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        sku: true,
        status: true,
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            categories: { select: { categoryId: true } },
            images: { orderBy: { position: 'asc' }, take: 1 },
          },
        },
        images: { orderBy: { position: 'asc' }, take: 1 },
        prices: {
          where: { currency },
          select: { currency: true, amount: true, compareAtAmount: true },
          take: 1,
        },
      },
    });

    if (!variant) {
      throw this.notFound('VARIANT_NOT_FOUND', 'Product variant was not found.');
    }

    return variant;
  }

  validateProductReferences(ids: string[]): Promise<void> {
    return this.requireAllProducts(ids);
  }

  validateCategoryReferences(ids: string[]): Promise<void> {
    return this.requireAllCategories(ids);
  }

  async listAdminProducts(query: ListProductsQueryDto) {
    const categoryScopeIds = query.category
      ? await this.resolveCategoryScopeIds(query.category, false)
      : undefined;
    const where = this.buildProductWhere(query, false, categoryScopeIds);
    const orderBy = this.buildProductOrder(query.sort);
    const skip = (query.page - 1) * query.limit;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: adminProductInclude,
        orderBy,
        skip,
        take: query.limit,
      }),
    ]);

    return this.paginated(items, total, query.page, query.limit);
  }

  async findAdminProduct(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: adminProductInclude,
    });

    if (!product) {
      throw this.notFound('PRODUCT_NOT_FOUND', 'Product was not found.');
    }

    return product;
  }

  async archiveProduct(id: string) {
    await this.requireProduct(id);
    await this.prisma.product.update({
      where: { id },
      data: { status: ProductStatus.ARCHIVED },
    });
    return { id, deleted: true };
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    await this.requireProduct(id);
    if (dto.brandId) {
      await this.requireBrand(dto.brandId);
    }
    if (dto.primaryCategoryId) {
      await this.requireCategory(dto.primaryCategoryId);
    }

    return this.withUniqueConflict(
      () =>
        this.prisma.product.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
            ...(dto.description !== undefined ? { description: dto.description } : {}),
            ...(dto.shortDescription !== undefined ? { shortDescription: dto.shortDescription } : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
            ...(dto.brandId !== undefined ? { brandId: dto.brandId } : {}),
            ...(dto.primaryCategoryId !== undefined
              ? { primaryCategoryId: dto.primaryCategoryId }
              : {}),
            ...(dto.details !== undefined ? { details: dto.details as Prisma.InputJsonValue } : {}),
            ...(dto.seoTitle !== undefined ? { seoTitle: dto.seoTitle } : {}),
            ...(dto.seoDescription !== undefined ? { seoDescription: dto.seoDescription } : {}),
            publishedAt: dto.status === ProductStatus.ACTIVE ? new Date() : undefined,
          },
          include: adminProductInclude,
        }),
      'PRODUCT_CONFLICT',
      'A product with this slug already exists.',
    );
  }

  async createVariant(productId: string, dto: CreateProductVariantDto) {
    await this.requireProduct(productId);
    const data = {
      productId,
      name: dto.name,
      sku: this.normalizeSku(dto.sku),
      barcode: dto.barcode,
      status: dto.status,
      isDefault: dto.isDefault,
      position: dto.position,
    };

    return this.withUniqueConflict(
      async () => {
        if (!dto.isDefault) {
          return this.prisma.productVariant.create({ data });
        }

        return this.prisma.$transaction(async (transaction) => {
          await transaction.productVariant.updateMany({
            where: { productId },
            data: { isDefault: false },
          });
          return transaction.productVariant.create({ data });
        });
      },
      'VARIANT_CONFLICT',
      'A variant with this SKU or barcode already exists.',
    );
  }

  async updateVariant(id: string, dto: UpdateProductVariantDto) {
    const variant = await this.requireVariant(id);
    const data = {
      ...dto,
      sku: dto.sku ? this.normalizeSku(dto.sku) : undefined,
    };

    return this.withUniqueConflict(
      async () => {
        if (!dto.isDefault) {
          return this.prisma.productVariant.update({ where: { id }, data });
        }

        return this.prisma.$transaction(async (transaction) => {
          await transaction.productVariant.updateMany({
            where: { productId: variant.productId },
            data: { isDefault: false },
          });
          return transaction.productVariant.update({ where: { id }, data });
        });
      },
      'VARIANT_CONFLICT',
      'A variant with this SKU or barcode already exists.',
    );
  }

  async createCategory(dto: CreateCategoryDto) {
    if (dto.parentId) {
      await this.requireCategory(dto.parentId);
    }

    return this.withUniqueConflict(
      () => this.prisma.category.create({ data: dto }),
      'CATEGORY_CONFLICT',
      'A category with this slug already exists.',
    );
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.requireCategory(id);
    if (dto.parentId !== undefined && dto.parentId !== null) {
      await this.assertValidCategoryParent(id, dto.parentId);
    }

    return this.withUniqueConflict(
      () => this.prisma.category.update({ where: { id }, data: dto }),
      'CATEGORY_CONFLICT',
      'A category with this slug already exists.',
    );
  }

  listAdminCategories() {
    return this.prisma.category.findMany({
      include: { parent: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
  }

  createBrand(dto: CreateBrandDto) {
    return this.withUniqueConflict(
      () => this.prisma.brand.create({ data: dto }),
      'BRAND_CONFLICT',
      'A brand with this slug already exists.',
    );
  }

  async updateBrand(id: string, dto: UpdateBrandDto) {
    await this.requireBrand(id);
    return this.withUniqueConflict(
      () => this.prisma.brand.update({ where: { id }, data: dto }),
      'BRAND_CONFLICT',
      'A brand with this slug already exists.',
    );
  }

  listAdminBrands() {
    return this.prisma.brand.findMany({ orderBy: { name: 'asc' } });
  }

  async createAttribute(productId: string, dto: CreateProductAttributeDto) {
    await this.requireProduct(productId);
    return this.withUniqueConflict(
      () => this.prisma.productAttribute.create({ data: { productId, ...dto } }),
      'ATTRIBUTE_CONFLICT',
      'This product already has an attribute with this name.',
    );
  }

  async createAttributeValue(attributeId: string, dto: CreateAttributeValueDto) {
    const attribute = await this.prisma.productAttribute.findUnique({
      where: { id: attributeId },
    });
    if (!attribute) {
      throw this.notFound('ATTRIBUTE_NOT_FOUND', 'Product attribute was not found.');
    }

    return this.withUniqueConflict(
      () => this.prisma.productAttributeValue.create({ data: { attributeId, ...dto } }),
      'ATTRIBUTE_VALUE_CONFLICT',
      'This attribute already has that value.',
    );
  }

  async setVariantAttributeValues(id: string, dto: SetVariantAttributeValuesDto) {
    const variant = await this.requireVariant(id);
    const values = await this.prisma.productAttributeValue.findMany({
      where: { id: { in: dto.valueIds } },
      include: { attribute: true },
    });
    const attributeIds = new Set(values.map((value) => value.attributeId));

    if (
      values.length !== dto.valueIds.length ||
      values.some((value) => value.attribute.productId !== variant.productId) ||
      attributeIds.size !== values.length
    ) {
      throw new BadRequestException({
        code: 'INVALID_VARIANT_ATTRIBUTE_VALUES',
        message:
          'Attribute values must exist, belong to the variant product, and be unique per attribute.',
      });
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.variantAttributeValue.deleteMany({ where: { variantId: id } });
      if (dto.valueIds.length) {
        await transaction.variantAttributeValue.createMany({
          data: dto.valueIds.map((attributeValueId) => ({
            variantId: id,
            attributeValueId,
          })),
        });
      }
    });

    return this.prisma.productVariant.findUnique({
      where: { id },
      include: {
        attributeValues: {
          include: { attributeValue: { include: { attribute: true } } },
        },
      },
    });
  }

  async createImage(productId: string, dto: CreateProductImageDto) {
    return this.createManagedImage(productId, dto);
  }

  async createManagedImage(
    productId: string,
    image: {
      url: string;
      altText?: string;
      variantId?: string;
      position?: number;
    },
  ) {
    await this.requireProduct(productId);
    if (image.variantId) {
      const variant = await this.requireVariant(image.variantId);
      if (variant.productId !== productId) {
        throw new BadRequestException({
          code: 'INVALID_IMAGE_VARIANT',
          message: 'The image variant must belong to the product.',
        });
      }
    }

    return this.prisma.productImage.create({ data: { productId, ...image } });
  }

  async deleteManagedImage(imageId: string): Promise<void> {
    await this.prisma.productImage.deleteMany({ where: { id: imageId } });
  }

  async deleteProductImage(productId: string, imageId: string) {
    await this.requireProduct(productId);
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });
    if (!image) {
      throw this.notFound('PRODUCT_IMAGE_NOT_FOUND', 'Product image was not found.');
    }
    await this.deleteManagedImage(imageId);
    return { id: imageId, deleted: true };
  }

  async setManagedCategoryImage(categoryId: string, imageUrl: string) {
    await this.requireCategory(categoryId);
    return this.prisma.category.update({
      where: { id: categoryId },
      data: { imageUrl },
    });
  }

  async clearManagedCategoryImage(categoryId: string, expectedImageUrl: string): Promise<void> {
    await this.prisma.category.updateMany({
      where: { id: categoryId, imageUrl: expectedImageUrl },
      data: { imageUrl: null },
    });
  }

  async upsertPrice(variantId: string, dto: UpsertProductPriceDto) {
    await this.requireVariant(variantId);
    const amount = new Prisma.Decimal(dto.amount);
    const compareAtAmount = dto.compareAtAmount
      ? new Prisma.Decimal(dto.compareAtAmount)
      : undefined;

    if (amount.isNegative() || compareAtAmount?.lessThan(amount)) {
      throw new BadRequestException({
        code: 'INVALID_PRODUCT_PRICE',
        message: 'Price must be non-negative and compare-at price cannot be lower than price.',
      });
    }

    return this.prisma.productPrice.upsert({
      where: { variantId_currency: { variantId, currency: dto.currency } },
      create: { variantId, currency: dto.currency, amount, compareAtAmount },
      update: { amount, compareAtAmount: compareAtAmount ?? null },
    });
  }

  createCollection(dto: CreateProductCollectionDto) {
    return this.withUniqueConflict(
      () => this.prisma.productCollection.create({ data: dto }),
      'COLLECTION_CONFLICT',
      'A collection with this slug already exists.',
    );
  }

  async updateCollection(id: string, dto: UpdateProductCollectionDto) {
    await this.requireCollection(id);
    return this.withUniqueConflict(
      () => this.prisma.productCollection.update({ where: { id }, data: dto }),
      'COLLECTION_CONFLICT',
      'A collection with this slug already exists.',
    );
  }

  listAdminCollections() {
    return this.prisma.productCollection.findMany({
      include: { products: { orderBy: { position: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async setProductCategories(productId: string, dto: SetResourceIdsDto) {
    await this.requireProduct(productId);
    await this.requireAllCategories(dto.ids);
    const primaryCategoryId = dto.ids[0] ?? null;
    await this.prisma.$transaction(async (transaction) => {
      await transaction.productCategory.deleteMany({ where: { productId } });
      if (dto.ids.length) {
        await transaction.productCategory.createMany({
          data: dto.ids.map((categoryId) => ({ productId, categoryId })),
        });
      }
      await transaction.product.update({
        where: { id: productId },
        data: { primaryCategoryId },
      });
    });
    return this.findAdminProduct(productId);
  }

  async setCollectionProducts(collectionId: string, dto: SetResourceIdsDto) {
    await this.requireCollection(collectionId);
    await this.requireAllProducts(dto.ids);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.productCollectionItem.deleteMany({ where: { collectionId } });
      if (dto.ids.length) {
        await transaction.productCollectionItem.createMany({
          data: dto.ids.map((productId, position) => ({ collectionId, productId, position })),
        });
      }
    });
    return this.prisma.productCollection.findUnique({
      where: { id: collectionId },
      include: { products: { orderBy: { position: 'asc' }, include: { product: true } } },
    });
  }

  async setRelatedProducts(productId: string, dto: SetResourceIdsDto) {
    await this.requireProduct(productId);
    if (dto.ids.includes(productId)) {
      throw new BadRequestException({
        code: 'INVALID_RELATED_PRODUCT',
        message: 'A product cannot be related to itself.',
      });
    }
    await this.requireAllProducts(dto.ids);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.relatedProduct.deleteMany({ where: { productId } });
      if (dto.ids.length) {
        await transaction.relatedProduct.createMany({
          data: dto.ids.map((relatedProductId, position) => ({
            productId,
            relatedProductId,
            position,
          })),
        });
      }
    });
    return this.findAdminProduct(productId);
  }

  async listStoreProducts(query: ListProductsQueryDto) {
    const categoryScopeIds = query.category
      ? await this.resolveCategoryScopeIds(query.category, true)
      : undefined;
    if (query.category && !categoryScopeIds?.length) {
      return this.paginated([], 0, query.page, query.limit);
    }
    const where = this.buildProductWhere(query, true, categoryScopeIds);
    const skip = (query.page - 1) * query.limit;
    const specialSort =
      Boolean(query.inStock) ||
      [
      ProductSort.PriceAsc,
      ProductSort.PriceDesc,
      ProductSort.Bestselling,
      ProductSort.Popular,
      ].includes(query.sort);
    const [databaseTotal, foundItems] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: specialSort ? undefined : this.buildProductOrder(query.sort),
        skip: specialSort ? undefined : skip,
        take: specialSort ? undefined : query.limit,
        select: {
          ...publicProductListSelect,
          variants: {
            ...publicProductListSelect.variants,
            include: {
              ...publicProductListSelect.variants.include,
              prices: { where: query.currency ? { currency: query.currency } : undefined },
            },
          },
        },
      }),
    ]);
    let rawItems = foundItems;
    if (query.inStock) {
      rawItems = rawItems.filter((product) =>
        product.variants.some(
          (variant) =>
            (variant.inventory?.currentStock ?? 0) -
              (variant.inventory?.reservedStock ?? 0) >
            0,
        ),
      );
    }
    const total = query.inStock ? rawItems.length : databaseTotal;
    if (query.sort === ProductSort.PriceAsc || query.sort === ProductSort.PriceDesc) {
      const direction = query.sort === ProductSort.PriceAsc ? 1 : -1;
      rawItems.sort((left, right) => {
        const leftPrice = this.minimumProductPrice(left, direction);
        const rightPrice = this.minimumProductPrice(right, direction);
        return leftPrice.comparedTo(rightPrice) * direction;
      });
    } else if (query.sort === ProductSort.Bestselling) {
      const variantIds = rawItems.flatMap((product) =>
        product.variants.map((variant) => variant.id),
      );
      const sales = variantIds.length
        ? await this.prisma.orderItem.groupBy({
            by: ['variantId'],
            where: {
              variantId: { in: variantIds },
              order: {
                paymentStatus: {
                  in: [
                    'PAID',
                    'PARTIALLY_REFUNDED',
                    'REFUNDED',
                  ],
                },
              },
            },
            _sum: { quantity: true },
          })
        : [];
      const score = new Map(
        sales.map((row) => [row.variantId, row._sum.quantity ?? 0]),
      );
      rawItems.sort(
        (left, right) =>
          right.variants.reduce(
            (sum, variant) => sum + (score.get(variant.id) ?? 0),
            0,
          ) -
          left.variants.reduce(
            (sum, variant) => sum + (score.get(variant.id) ?? 0),
            0,
          ),
      );
    } else if (query.sort === ProductSort.Popular) {
      const productIds = rawItems.map((product) => product.id);
      const [wishlist, reviews] = productIds.length
        ? await Promise.all([
            this.prisma.wishlistItem.groupBy({
              by: ['productId'],
              where: { productId: { in: productIds } },
              _count: true,
            }),
            this.prisma.productReview.groupBy({
              by: ['productId'],
              where: {
                productId: { in: productIds },
                status: 'APPROVED',
              },
              _count: true,
            }),
          ])
        : [[], []];
      const score = new Map<string, number>();
      for (const row of wishlist) score.set(row.productId, row._count * 2);
      for (const row of reviews) {
        score.set(row.productId, (score.get(row.productId) ?? 0) + row._count);
      }
      rawItems.sort(
        (left, right) =>
          (score.get(right.id) ?? 0) - (score.get(left.id) ?? 0),
      );
    }
    if (specialSort) rawItems = rawItems.slice(skip, skip + query.limit);

    if (query.ids?.length) {
      const order = new Map(query.ids.map((id, index) => [id, index]));
      rawItems.sort(
        (left, right) =>
          (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      );
    }

    const items = rawItems.map((product) => ({
      ...product,
      variants: product.variants.map((variant) => ({
        ...variant,
        availableStock: Math.max(
          0,
          (variant.inventory?.currentStock ?? 0) - (variant.inventory?.reservedStock ?? 0),
        ),
        inventory: undefined,
      })),
    }));
    return this.paginated(items, total, query.page, query.limit);
  }

  private minimumProductPrice(product: {
    variants: Array<{ prices: Array<{ amount: Prisma.Decimal }> }>;
  }, direction: number): Prisma.Decimal {
    const prices = product.variants.flatMap((variant) =>
      variant.prices.map((price) => price.amount),
    );
    return prices.length
      ? prices.reduce((minimum, price) => Prisma.Decimal.min(minimum, price))
      : new Prisma.Decimal(direction > 0 ? '999999999999999999' : '-1');
  }

  async findStoreProduct(slug: string, currency?: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: ProductStatus.ACTIVE },
      select: {
        ...publicProductDetailSelect,
        variants: {
          ...publicProductDetailSelect.variants,
          include: {
            ...publicProductDetailSelect.variants.include,
            prices: { where: currency ? { currency } : undefined },
          },
        },
      },
    });

    if (!product) {
      throw this.notFound('PRODUCT_NOT_FOUND', 'Product was not found.');
    }
    const categoryAncestors = await this.buildCategoryAncestorChain(
      product.categories[0]?.categoryId ?? null,
    );
    return {
      ...product,
      categoryAncestors,
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

  async listStoreCategories() {
    const categories = await this.prisma.category.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        parentId: true,
        name: true,
        slug: true,
        description: true,
        imageUrl: true,
        position: true,
        isActive: true,
      },
    });
    const flat = categories as FlatCategoryNode[];
    const publicIds = getPublicCategoryIds(flat);
    const publicCategoryIds = [...publicIds];
    const childrenMap = buildChildrenMap(flat);
    const pairs = await this.prisma.productCategory.findMany({
      where: {
        categoryId: { in: publicCategoryIds },
        product: { status: ProductStatus.ACTIVE },
      },
      select: { productId: true, categoryId: true },
    });
    const productsByCategory = new Map<string, Set<string>>();
    for (const pair of pairs) {
      const assigned = productsByCategory.get(pair.categoryId) ?? new Set<string>();
      assigned.add(pair.productId);
      productsByCategory.set(pair.categoryId, assigned);
    }
    const directCounts = new Map<string, number>();
    for (const categoryId of publicCategoryIds) {
      directCounts.set(categoryId, productsByCategory.get(categoryId)?.size ?? 0);
    }
    const subtreeCounts = buildSubtreeProductCounts(
      publicCategoryIds,
      childrenMap,
      productsByCategory,
    );
    return buildStoreCategoryTree(flat, publicIds, directCounts, subtreeCounts);
  }

  listStoreBrands() {
    return this.prisma.brand.findMany({
      where: { products: { some: { status: ProductStatus.ACTIVE } } },
      orderBy: { name: 'asc' },
    });
  }

  listStoreCollections() {
    return this.prisma.productCollection.findMany({
      where: { isActive: true },
      include: {
        products: {
          where: { product: { status: ProductStatus.ACTIVE } },
          orderBy: { position: 'asc' },
          include: { product: { include: { images: { orderBy: { position: 'asc' }, take: 1 } } } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  private buildProductWhere(
    query: ListProductsQueryDto,
    storeOnly: boolean,
    categoryScopeIds?: string[] | null,
  ): Prisma.ProductWhereInput {
    const priceFilter =
      query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            currency: query.currency,
            amount: {
              ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
              ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
            },
          }
        : undefined;
    const categoryFilter = categoryScopeIds?.length
      ? {
          some: {
            categoryId: { in: categoryScopeIds },
            ...(storeOnly ? { category: { isActive: true } } : {}),
          },
        }
      : undefined;
    return {
      id: query.ids?.length ? { in: query.ids } : undefined,
      status: storeOnly
        ? ProductStatus.ACTIVE
        : query.status !== undefined
          ? query.status
          : { not: ProductStatus.ARCHIVED },
      brand: query.brand ? { slug: query.brand } : undefined,
      categories: categoryFilter,
      collections: query.collection
        ? {
            some: {
              collection: { slug: query.collection, isActive: storeOnly ? true : undefined },
            },
          }
        : undefined,
      variants:
        priceFilter || query.inStock
          ? {
              some: {
                status: ProductVariantStatus.ACTIVE,
                prices: priceFilter ? { some: priceFilter } : undefined,
                inventory: query.inStock ? { is: { currentStock: { gt: 0 } } } : undefined,
              },
            }
          : undefined,
      OR: query.search
        ? [
            { name: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
            { variants: { some: { sku: { contains: query.search, mode: 'insensitive' } } } },
          ]
        : undefined,
    };
  }

  private buildProductOrder(sort: ProductSort): Prisma.ProductOrderByWithRelationInput[] {
    if (sort === ProductSort.NameAsc) {
      return [{ name: 'asc' }];
    }
    if (sort === ProductSort.NameDesc) {
      return [{ name: 'desc' }];
    }
    return [{ createdAt: 'desc' }];
  }

  private paginated<T>(items: T[], total: number, page: number, limit: number) {
    return {
      items,
      pagination: {
        page,
        limit,
        total,
        pageCount: Math.ceil(total / limit),
      },
    };
  }

  private normalizeSku(sku: string): string {
    return sku.trim().toUpperCase();
  }

  private async requireProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw this.notFound('PRODUCT_NOT_FOUND', 'Product was not found.');
    }
    return product;
  }

  private async requireVariant(id: string) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id } });
    if (!variant) {
      throw this.notFound('VARIANT_NOT_FOUND', 'Product variant was not found.');
    }
    return variant;
  }

  private async requireCategory(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw this.notFound('CATEGORY_NOT_FOUND', 'Category was not found.');
    }
    return category;
  }

  /** Rejects self-parent and nesting a category under one of its descendants. */
  private async assertValidCategoryParent(categoryId: string, parentId: string) {
    if (parentId === categoryId) {
      throw new BadRequestException({
        code: 'INVALID_CATEGORY_PARENT',
        message: 'A category cannot be its own parent.',
      });
    }

    await this.requireCategory(parentId);

    let currentId: string | null = parentId;
    const seen = new Set<string>();
    while (currentId) {
      if (currentId === categoryId) {
        throw new BadRequestException({
          code: 'INVALID_CATEGORY_PARENT',
          message: 'A category cannot be nested under one of its descendants.',
        });
      }
      if (seen.has(currentId)) {
        break;
      }
      seen.add(currentId);
      const node = (await this.prisma.category.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      })) as { parentId: string | null } | null;
      currentId = node?.parentId ?? null;
    }
  }

  private async requireBrand(id: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) {
      throw this.notFound('BRAND_NOT_FOUND', 'Brand was not found.');
    }
    return brand;
  }

  private async requireCollection(id: string) {
    const collection = await this.prisma.productCollection.findUnique({ where: { id } });
    if (!collection) {
      throw this.notFound('COLLECTION_NOT_FOUND', 'Collection was not found.');
    }
    return collection;
  }

  private async requireAllProducts(ids: string[]): Promise<void> {
    const count = await this.prisma.product.count({ where: { id: { in: ids } } });
    if (count !== ids.length) {
      throw this.notFound('PRODUCT_NOT_FOUND', 'One or more products were not found.');
    }
  }

  private async requireAllCategories(ids: string[]): Promise<void> {
    const count = await this.prisma.category.count({ where: { id: { in: ids } } });
    if (count !== ids.length) {
      throw this.notFound('CATEGORY_NOT_FOUND', 'One or more categories were not found.');
    }
  }

  private async resolveCategoryScopeIds(
    slug: string,
    storeOnly: boolean,
  ): Promise<string[] | null> {
    const category = await this.prisma.category.findUnique({ where: { slug } });
    if (!category) return null;
    if (storeOnly && !category.isActive) return null;

    const categories = await this.prisma.category.findMany({
      select: {
        id: true,
        parentId: true,
        name: true,
        slug: true,
        description: true,
        imageUrl: true,
        position: true,
        isActive: true,
      },
    });
    const flat = categories as FlatCategoryNode[];
    const publicIds = storeOnly ? getPublicCategoryIds(flat) : new Set(flat.map((node) => node.id));
    if (!publicIds.has(category.id)) return null;

    const childrenMap = buildChildrenMap(flat);
    const descendants = getDescendantIds(category.id, childrenMap).filter((id) =>
      publicIds.has(id),
    );
    return [category.id, ...descendants];
  }

  private async buildCategoryAncestorChain(primaryCategoryId: string | null) {
    if (!primaryCategoryId) return [];

    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      select: {
        id: true,
        parentId: true,
        name: true,
        slug: true,
        description: true,
        imageUrl: true,
        position: true,
        isActive: true,
      },
    });
    const flat = categories as FlatCategoryNode[];
    const publicIds = getPublicCategoryIds(flat);
    if (!publicIds.has(primaryCategoryId)) return [];

    const nodesById = new Map(flat.map((node) => [node.id, node]));
    const parentMap = new Map(flat.map((node) => [node.id, node.parentId]));
    const ancestorIds = getAncestorIds(primaryCategoryId, parentMap).filter((id) =>
      publicIds.has(id),
    );
    const chain = ancestorIds
      .map((id) => nodesById.get(id))
      .filter((node): node is FlatCategoryNode => Boolean(node))
      .map((node) => ({ id: node.id, name: node.name, slug: node.slug }));
    const primary = nodesById.get(primaryCategoryId);
    if (primary) {
      chain.push({ id: primary.id, name: primary.name, slug: primary.slug });
    }
    return chain;
  }

  private notFound(code: string, message: string): NotFoundException {
    return new NotFoundException({ code, message });
  }

  private async withUniqueConflict<T>(
    operation: () => Promise<T>,
    code: string,
    message: string,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code, message });
      }
      throw error;
    }
  }
}
