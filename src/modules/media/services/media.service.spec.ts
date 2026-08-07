import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaAsset, MediaAssetStatus, MediaAssetType } from '@prisma/client';

import { BackgroundJobQueue } from '../../../infrastructure/background/background-job-queue.service';
import { BackgroundJobName } from '../../../infrastructure/background/background-job.types';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CatalogService } from '../../catalog/services/catalog.service';
import { FileStorage } from '../contracts/file-storage';
import { ImageProcessor } from '../contracts/image-processor';
import { MediaService } from './media.service';

describe('MediaService', () => {
  const now = new Date();
  const productId = '11111111-1111-4111-8111-111111111111';
  const variantId = '22222222-2222-4222-8222-222222222222';
  const staffUserId = '33333333-3333-4333-8333-333333333333';
  const assetId = '44444444-4444-4444-8444-444444444444';
  const baseAsset: MediaAsset = {
    id: assetId,
    type: MediaAssetType.PRODUCT_IMAGE,
    status: MediaAssetStatus.PROCESSING,
    ownerId: productId,
    catalogImageId: null,
    storageProvider: 'local',
    originalKey: 'media/product-image/id/original.png',
    originalUrl: '/media/product-image/id/original.png',
    originalFilename: 'product.png',
    mimeType: 'image/png',
    sizeBytes: 100,
    width: 1_600,
    height: 900,
    variants: null,
    altText: 'Product',
    position: 2,
    linkUrl: null,
    startsAt: null,
    endsAt: null,
    isActive: true,
    processingError: null,
    createdByStaffUserId: staffUserId,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const readyAsset: MediaAsset = {
    ...baseAsset,
    status: MediaAssetStatus.READY,
    variants: {
      thumbnail: {
        key: 'media/product-image/id/thumbnail.webp',
        url: '/media/product-image/id/thumbnail.webp',
        mimeType: 'image/webp',
        width: 320,
        height: 180,
        sizeBytes: 20,
      },
      medium: {
        key: 'media/product-image/id/medium.webp',
        url: '/media/product-image/id/medium.webp',
        mimeType: 'image/webp',
        width: 1_280,
        height: 720,
        sizeBytes: 60,
      },
    },
  };
  const prisma = {
    mediaAsset: {
      create: jest.fn(() => baseAsset),
      update: jest.fn((input: { data: Partial<MediaAsset> }) => ({
        ...readyAsset,
        ...input.data,
      })),
      findUnique: jest.fn(() => Promise.resolve(readyAsset)),
      findMany: jest.fn(() => []),
      count: jest.fn(() => 0),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
  };
  const catalog = {
    validateProductReferences: jest.fn(),
    validateCategoryReferences: jest.fn(),
    getVariantReference: jest.fn(() => Promise.resolve({ id: variantId, productId })),
    createManagedImage: jest.fn(() => ({ id: '55555555-5555-4555-8555-555555555555' })),
    deleteManagedImage: jest.fn(),
    setManagedCategoryImage: jest.fn(),
    clearManagedCategoryImage: jest.fn(),
  };
  const storage = {
    name: 'local',
    upload: jest.fn((input: { key: string }) => ({ key: input.key, url: `/${input.key}` })),
    read: jest.fn(),
    delete: jest.fn(),
    getUrl: jest.fn(),
  };
  const processor = {
    inspect: jest.fn(() => ({ format: 'png', width: 1_600, height: 900 })),
    createVariants: jest.fn(),
  };
  const backgroundJobs = { add: jest.fn(() => ({ id: 'image-job' })) };
  const config = { get: jest.fn(() => 10 * 1024 * 1024) };
  const service = new MediaService(
    prisma as unknown as PrismaService,
    catalog as unknown as CatalogService,
    config as unknown as ConfigService,
    backgroundJobs as unknown as BackgroundJobQueue,
    storage as unknown as FileStorage,
    processor as unknown as ImageProcessor,
  );
  const file = {
    fieldname: 'file',
    originalname: 'product.png',
    encoding: '7bit',
    mimetype: 'application/octet-stream',
    size: 100,
    buffer: Buffer.from('decoded-image'),
    stream: undefined,
    destination: '',
    filename: '',
    path: '',
  } as unknown as Express.Multer.File;

  beforeEach(() => jest.clearAllMocks());

  it('validates ownership, queues processing, and publishes the original URL to Catalog', async () => {
    const result = await service.uploadProductImage(
      productId,
      { variantId, altText: 'Product', position: 2 },
      file,
      staffUserId,
    );

    expect(catalog.validateProductReferences).toHaveBeenCalledWith([productId]);
    expect(catalog.getVariantReference).toHaveBeenCalledWith(variantId);
    expect(processor.inspect).toHaveBeenCalledWith(file.buffer);
    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'image/png', body: file.buffer }),
    );
    expect(backgroundJobs.add).toHaveBeenCalledWith(BackgroundJobName.IMAGE_PROCESSING, {
      mediaAssetId: assetId,
    });
    expect(catalog.createManagedImage).toHaveBeenCalledWith(productId, {
      url: '/media/product-image/id/original.png',
      altText: 'Product',
      position: 2,
      variantId,
    });
    expect(result.catalogImageId).toBe('55555555-5555-4555-8555-555555555555');
  });

  it('rejects a variant owned by a different product before storing bytes', async () => {
    catalog.getVariantReference.mockResolvedValueOnce({
      id: variantId,
      productId: 'other-product',
    });

    await expect(
      service.uploadProductImage(productId, { variantId }, file, staffUserId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('deletes the original, variants, and Catalog read-model image', async () => {
    prisma.mediaAsset.findUnique.mockResolvedValueOnce({
      ...readyAsset,
      catalogImageId: '55555555-5555-4555-8555-555555555555',
    });

    const deleted = await service.deleteAsset(assetId);

    expect(storage.delete).toHaveBeenCalledTimes(3);
    expect(catalog.deleteManagedImage).toHaveBeenCalledWith('55555555-5555-4555-8555-555555555555');
    expect(deleted.status).toBe(MediaAssetStatus.DELETED);
    expect(deleted.deletedAt).toBeInstanceOf(Date);
  });

  it('rejects a banner whose active window ends before it starts', async () => {
    await expect(
      service.uploadBanner(
        { startsAt: '2026-07-20T00:00:00.000Z', endsAt: '2026-07-19T00:00:00.000Z' },
        file,
        staffUserId,
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_BANNER_SCHEDULE' } });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('uploads unbound library assets without catalog side effects', async () => {
    prisma.mediaAsset.create.mockImplementationOnce(() => ({
      ...baseAsset,
      type: MediaAssetType.LIBRARY,
      ownerId: null,
      catalogImageId: null,
    }));

    const result = await service.uploadLibraryAsset(
      { altText: 'Hero' },
      file,
      staffUserId,
    );

    expect(result.type).toBe(MediaAssetType.LIBRARY);
    expect(catalog.createManagedImage).not.toHaveBeenCalled();
    expect(catalog.setManagedCategoryImage).not.toHaveBeenCalled();
    expect(backgroundJobs.add).toHaveBeenCalledWith(BackgroundJobName.IMAGE_PROCESSING, {
      mediaAssetId: assetId,
    });
  });

  it('promotes an existing shop logo asset without cloning storage', async () => {
    const logo = {
      ...readyAsset,
      type: MediaAssetType.SHOP_LOGO,
      ownerId: null,
      catalogImageId: null,
    };
    prisma.mediaAsset.findUnique.mockImplementationOnce(() => Promise.resolve(logo));
    prisma.mediaAsset.findMany.mockImplementationOnce(() => []);

    const result = await service.promoteShopLogo(assetId, staffUserId);

    expect(storage.read).not.toHaveBeenCalled();
    expect(result.isActive).toBe(true);
  });
});
