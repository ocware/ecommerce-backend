import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaAsset, MediaAssetStatus, MediaAssetType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { BackgroundJobQueue } from '../../../infrastructure/background/background-job-queue.service';
import { BackgroundJobName } from '../../../infrastructure/background/background-job.types';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CatalogService } from '../../catalog/services/catalog.service';
import { FILE_STORAGE, FileStorage } from '../contracts/file-storage';
import { IMAGE_PROCESSOR, ImageProcessor } from '../contracts/image-processor';
import { ListMediaQueryDto } from '../dto/list-media-query.dto';
import { UpdateBannerDto } from '../dto/update-banner.dto';
import { UploadBannerDto } from '../dto/upload-banner.dto';
import { UploadCategoryImageDto } from '../dto/upload-category-image.dto';
import { UploadProductImageDto } from '../dto/upload-product-image.dto';
import { UploadLibraryDto } from '../dto/upload-library.dto';
import { UploadShopLogoDto } from '../dto/upload-shop-logo.dto';
import { MediaVariants } from '../jobs/image-resizing.job';

type UploadedImage = Express.Multer.File | undefined;

type CreateAssetInput = {
  type: MediaAssetType;
  ownerId?: string;
  altText?: string;
  position?: number;
  linkUrl?: string;
  startsAt?: Date;
  endsAt?: Date;
  isActive?: boolean;
};

@Injectable()
export class MediaService {
  private readonly maximumUploadBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: CatalogService,
    private readonly configService: ConfigService,
    private readonly backgroundJobs: BackgroundJobQueue,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(IMAGE_PROCESSOR) private readonly imageProcessor: ImageProcessor,
  ) {
    this.maximumUploadBytes =
      this.configService.get<number>('app.mediaMaxUploadBytes') ?? 10 * 1024 * 1024;
  }

  async uploadProductImage(
    productId: string,
    dto: UploadProductImageDto,
    file: UploadedImage,
    staffUserId: string,
  ) {
    await this.catalogService.validateProductReferences([productId]);
    if (dto.variantId) {
      const variant = await this.catalogService.getVariantReference(dto.variantId);
      if (variant.productId !== productId) {
        throw new BadRequestException({
          code: 'INVALID_IMAGE_VARIANT',
          message: 'The image variant must belong to the product.',
        });
      }
    }

    const asset = await this.createAsset(
      {
        type: MediaAssetType.PRODUCT_IMAGE,
        ownerId: productId,
        altText: dto.altText,
        position: dto.position,
      },
      file,
      staffUserId,
    );
    try {
      const catalogImage = await this.catalogService.createManagedImage(productId, {
        url: this.displayUrl(asset),
        altText: dto.altText,
        position: dto.position,
        variantId: dto.variantId,
      });
      return this.prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { catalogImageId: catalogImage.id },
      });
    } catch (error) {
      await this.deleteAsset(asset.id);
      throw error;
    }
  }

  async uploadCategoryImage(
    categoryId: string,
    dto: UploadCategoryImageDto,
    file: UploadedImage,
    staffUserId: string,
  ) {
    await this.catalogService.validateCategoryReferences([categoryId]);
    const asset = await this.createAsset(
      {
        type: MediaAssetType.CATEGORY_IMAGE,
        ownerId: categoryId,
        altText: dto.altText,
      },
      file,
      staffUserId,
    );
    await this.replaceAssets(MediaAssetType.CATEGORY_IMAGE, categoryId, asset);
    await this.catalogService.setManagedCategoryImage(categoryId, this.displayUrl(asset));
    return asset;
  }

  async uploadShopLogo(dto: UploadShopLogoDto, file: UploadedImage, staffUserId: string) {
    const asset = await this.createAsset(
      { type: MediaAssetType.SHOP_LOGO, altText: dto.altText },
      file,
      staffUserId,
    );
    await this.replaceAssets(MediaAssetType.SHOP_LOGO, undefined, asset);
    return asset;
  }

  async uploadLibraryAsset(dto: UploadLibraryDto, file: UploadedImage, staffUserId: string) {
    return this.createAsset(
      { type: MediaAssetType.LIBRARY, altText: dto.altText },
      file,
      staffUserId,
    );
  }

  /**
   * Makes an existing asset the active shop logo.
   * SHOP_LOGO assets are promoted in place; other types are cloned (new storage key).
   */
  async promoteShopLogo(assetId: string, staffUserId: string) {
    const source = await this.requireAsset(assetId);
    if (source.status === MediaAssetStatus.DELETED) {
      throw this.notFound();
    }

    if (source.type === MediaAssetType.SHOP_LOGO) {
      await this.replaceAssets(MediaAssetType.SHOP_LOGO, undefined, source);
      return this.prisma.mediaAsset.update({
        where: { id: source.id },
        data: { isActive: true },
      });
    }

    const body = await this.storage.read(source.originalKey);
    const extension = source.originalFilename.includes('.')
      ? source.originalFilename.split('.').pop()!
      : source.mimeType.split('/')[1] || 'bin';
    const originalKey = `${this.typePath(MediaAssetType.SHOP_LOGO)}/${randomUUID()}/original.${extension}`;
    const stored = await this.storage.upload({
      key: originalKey,
      body,
      contentType: source.mimeType,
      cacheControl: 'public, max-age=31536000, immutable',
    });

    let asset: MediaAsset;
    try {
      asset = await this.prisma.mediaAsset.create({
        data: {
          type: MediaAssetType.SHOP_LOGO,
          status: source.status === MediaAssetStatus.READY
            ? MediaAssetStatus.READY
            : MediaAssetStatus.PROCESSING,
          altText: source.altText,
          position: 0,
          isActive: true,
          storageProvider: this.storage.name,
          originalKey: stored.key,
          originalUrl: stored.url,
          originalFilename: source.originalFilename,
          mimeType: source.mimeType,
          sizeBytes: source.sizeBytes,
          width: source.width,
          height: source.height,
          variants: source.variants ?? undefined,
          createdByStaffUserId: staffUserId,
        },
      });
    } catch (error) {
      await this.storage.delete(stored.key);
      throw error;
    }

    await this.replaceAssets(MediaAssetType.SHOP_LOGO, undefined, asset);
    if (asset.status === MediaAssetStatus.PROCESSING) {
      await this.backgroundJobs.add(BackgroundJobName.IMAGE_PROCESSING, {
        mediaAssetId: asset.id,
      });
    }
    return asset;
  }

  async uploadBanner(dto: UploadBannerDto, file: UploadedImage, staffUserId: string) {
    const dates = this.validateDates(dto.startsAt, dto.endsAt);
    return this.createAsset(
      {
        type: MediaAssetType.BANNER,
        altText: dto.altText,
        linkUrl: dto.linkUrl,
        position: dto.position,
        isActive: dto.isActive,
        ...dates,
      },
      file,
      staffUserId,
    );
  }

  async updateBanner(id: string, dto: UpdateBannerDto) {
    const banner = await this.requireAsset(id);
    if (banner.type !== MediaAssetType.BANNER || banner.status === MediaAssetStatus.DELETED) {
      throw this.notFound();
    }
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : banner.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : banner.endsAt;
    this.assertDateOrder(startsAt, endsAt);

    return this.prisma.mediaAsset.update({
      where: { id },
      data: {
        altText: dto.altText,
        linkUrl: dto.linkUrl,
        position: dto.position,
        isActive: dto.isActive,
        startsAt: dto.startsAt ? startsAt : undefined,
        endsAt: dto.endsAt ? endsAt : undefined,
      },
    });
  }

  async deleteAsset(id: string) {
    const asset = await this.requireAsset(id);
    if (asset.status === MediaAssetStatus.DELETED) {
      return asset;
    }

    await Promise.all(this.storageKeys(asset).map((key) => this.storage.delete(key)));
    if (asset.catalogImageId) {
      await this.catalogService.deleteManagedImage(asset.catalogImageId);
    }
    if (asset.type === MediaAssetType.CATEGORY_IMAGE && asset.ownerId) {
      await this.catalogService.clearManagedCategoryImage(asset.ownerId, this.displayUrl(asset));
    }

    return this.prisma.mediaAsset.update({
      where: { id },
      data: {
        status: MediaAssetStatus.DELETED,
        deletedAt: new Date(),
        isActive: false,
      },
    });
  }

  async listAdmin(query: ListMediaQueryDto) {
    const where: Prisma.MediaAssetWhereInput = {
      type: query.type,
      status: query.status ?? { not: MediaAssetStatus.DELETED },
    };
    const skip = (query.page - 1) * query.limit;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.mediaAsset.count({ where }),
      this.prisma.mediaAsset.findMany({
        where,
        orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
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

  async getShopLogo() {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { type: MediaAssetType.SHOP_LOGO, status: MediaAssetStatus.READY },
      orderBy: { createdAt: 'desc' },
    });
    return asset ? this.publicAsset(asset) : null;
  }

  async listStoreBanners() {
    const now = new Date();
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        type: MediaAssetType.BANNER,
        status: MediaAssetStatus.READY,
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    });
    return assets.map((asset) => this.publicAsset(asset));
  }

  private async createAsset(
    input: CreateAssetInput,
    uploadedFile: UploadedImage,
    staffUserId: string,
  ) {
    const file = this.requireFile(uploadedFile);
    const metadata = await this.imageProcessor.inspect(file.buffer);
    const extension = metadata.format === 'jpeg' ? 'jpg' : metadata.format;
    const contentType = `image/${metadata.format}`;
    const originalKey = `${this.typePath(input.type)}/${randomUUID()}/original.${extension}`;
    const stored = await this.storage.upload({
      key: originalKey,
      body: file.buffer,
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    });

    let asset: MediaAsset;
    try {
      asset = await this.prisma.mediaAsset.create({
        data: {
          ...input,
          position: input.position ?? 0,
          isActive: input.isActive ?? true,
          storageProvider: this.storage.name,
          originalKey: stored.key,
          originalUrl: stored.url,
          originalFilename: file.originalname,
          mimeType: contentType,
          sizeBytes: file.size,
          width: metadata.width,
          height: metadata.height,
          createdByStaffUserId: staffUserId,
        },
      });
    } catch (error) {
      await this.storage.delete(stored.key);
      throw error;
    }

    await this.backgroundJobs.add(BackgroundJobName.IMAGE_PROCESSING, {
      mediaAssetId: asset.id,
    });
    return asset;
  }

  private requireFile(file: UploadedImage): Express.Multer.File {
    if (!file) {
      throw new BadRequestException({
        code: 'MEDIA_FILE_REQUIRED',
        message: 'An image file is required.',
      });
    }
    if (file.size > this.maximumUploadBytes) {
      throw new PayloadTooLargeException({
        code: 'MEDIA_FILE_TOO_LARGE',
        message: `The image cannot exceed ${this.maximumUploadBytes} bytes.`,
        details: { maximumBytes: this.maximumUploadBytes },
      });
    }
    return file;
  }

  private async replaceAssets(type: MediaAssetType, ownerId: string | undefined, keep: MediaAsset) {
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        type,
        ownerId: ownerId ?? null,
        id: { not: keep.id },
        createdAt: { lt: keep.createdAt },
        status: { not: MediaAssetStatus.DELETED },
      },
      select: { id: true },
    });
    for (const asset of assets) {
      await this.deleteAsset(asset.id);
    }
  }

  private storageKeys(asset: MediaAsset): string[] {
    const variants = asset.variants as MediaVariants | null;
    return [
      asset.originalKey,
      ...(variants ? Object.values(variants).map((variant) => variant.key) : []),
    ];
  }

  private displayUrl(asset: MediaAsset): string {
    const variants = asset.variants as MediaVariants | null;
    return variants?.medium?.url ?? asset.originalUrl;
  }

  private publicAsset(asset: MediaAsset) {
    const variants = asset.variants as MediaVariants | null;
    return {
      id: asset.id,
      type: asset.type,
      url: this.displayUrl(asset),
      thumbnailUrl: variants?.thumbnail?.url ?? this.displayUrl(asset),
      width: asset.width,
      height: asset.height,
      altText: asset.altText,
      position: asset.position,
      linkUrl: asset.linkUrl,
      startsAt: asset.startsAt,
      endsAt: asset.endsAt,
      updatedAt: asset.updatedAt,
    };
  }

  private validateDates(startsAt?: string, endsAt?: string) {
    const dates = {
      startsAt: startsAt ? new Date(startsAt) : undefined,
      endsAt: endsAt ? new Date(endsAt) : undefined,
    };
    this.assertDateOrder(dates.startsAt, dates.endsAt);
    return dates;
  }

  private assertDateOrder(startsAt?: Date | null, endsAt?: Date | null) {
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new BadRequestException({
        code: 'INVALID_BANNER_SCHEDULE',
        message: 'Banner end time must be after its start time.',
      });
    }
  }

  private typePath(type: MediaAssetType): string {
    return `media/${type.toLowerCase().replaceAll('_', '-')}`;
  }

  private async requireAsset(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw this.notFound();
    return asset;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'MEDIA_NOT_FOUND',
      message: 'Media asset was not found.',
    });
  }
}
