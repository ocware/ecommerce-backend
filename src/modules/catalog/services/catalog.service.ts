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

const adminProductInclude = {
  brand: true,
  categories: {
    include: {
      category: true,
    },
  },
  variants: {
    orderBy: {
      position: 'asc' as const,
    },
    include: {
      prices: true,
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

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async createProduct(dto: CreateProductDto) {
    if (dto.brandId) {
      await this.requireBrand(dto.brandId);
    }

    return this.withUniqueConflict(
      () =>
        this.prisma.product.create({
          data: {
            ...dto,
            publishedAt: dto.status === ProductStatus.ACTIVE ? new Date() : undefined,
          },
          include: adminProductInclude,
        }),
      'PRODUCT_CONFLICT',
      'A product with this slug already exists.',
    );
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

  async listAdminProducts(query: ListProductsQueryDto) {
    const where = this.buildProductWhere(query, false);
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

  async updateProduct(id: string, dto: UpdateProductDto) {
    await this.requireProduct(id);
    if (dto.brandId) {
      await this.requireBrand(dto.brandId);
    }

    return this.withUniqueConflict(
      () =>
        this.prisma.product.update({
          where: { id },
          data: {
            ...dto,
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
    if (dto.parentId === id) {
      throw new BadRequestException({
        code: 'INVALID_CATEGORY_PARENT',
        message: 'A category cannot be its own parent.',
      });
    }
    if (dto.parentId) {
      await this.requireCategory(dto.parentId);
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
    await this.requireProduct(productId);
    if (dto.variantId) {
      const variant = await this.requireVariant(dto.variantId);
      if (variant.productId !== productId) {
        throw new BadRequestException({
          code: 'INVALID_IMAGE_VARIANT',
          message: 'The image variant must belong to the product.',
        });
      }
    }

    return this.prisma.productImage.create({ data: { productId, ...dto } });
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
    await this.prisma.$transaction(async (transaction) => {
      await transaction.productCategory.deleteMany({ where: { productId } });
      if (dto.ids.length) {
        await transaction.productCategory.createMany({
          data: dto.ids.map((categoryId) => ({ productId, categoryId })),
        });
      }
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
    const where = this.buildProductWhere(query, true);
    const orderBy = this.buildProductOrder(query.sort);
    const skip = (query.page - 1) * query.limit;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: query.limit,
        include: {
          brand: true,
          categories: {
            where: { category: { isActive: true } },
            include: { category: true },
          },
          images: { orderBy: { position: 'asc' }, take: 1 },
          variants: {
            where: { status: ProductVariantStatus.ACTIVE },
            orderBy: { position: 'asc' },
            include: {
              prices: { where: query.currency ? { currency: query.currency } : undefined },
            },
          },
        },
      }),
    ]);

    return this.paginated(items, total, query.page, query.limit);
  }

  async findStoreProduct(slug: string, currency?: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: ProductStatus.ACTIVE },
      include: {
        brand: true,
        categories: {
          where: { category: { isActive: true } },
          include: { category: true },
        },
        images: { orderBy: { position: 'asc' } },
        attributes: {
          orderBy: { position: 'asc' },
          include: { values: { orderBy: { position: 'asc' } } },
        },
        variants: {
          where: { status: ProductVariantStatus.ACTIVE },
          orderBy: { position: 'asc' },
          include: {
            prices: { where: currency ? { currency } : undefined },
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
          orderBy: { position: 'asc' },
          include: {
            relatedProduct: {
              include: { images: { orderBy: { position: 'asc' }, take: 1 } },
            },
          },
        },
      },
    });

    if (!product) {
      throw this.notFound('PRODUCT_NOT_FOUND', 'Product was not found.');
    }
    return product;
  }

  listStoreCategories() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      include: { children: { where: { isActive: true }, orderBy: { position: 'asc' } } },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
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
  ): Prisma.ProductWhereInput {
    return {
      status: storeOnly ? ProductStatus.ACTIVE : query.status,
      brand: query.brand ? { slug: query.brand } : undefined,
      categories: query.category
        ? {
            some: {
              category: {
                slug: query.category,
                isActive: storeOnly ? true : undefined,
              },
            },
          }
        : undefined,
      collections: query.collection
        ? {
            some: {
              collection: { slug: query.collection, isActive: storeOnly ? true : undefined },
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
