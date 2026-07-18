import { MediaAssetStatus, MediaAssetType } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { FileStorage } from '../contracts/file-storage';
import { ImageProcessor } from '../contracts/image-processor';
import { ImageResizingJob } from './image-resizing.job';

describe('ImageResizingJob', () => {
  const asset = {
    id: '11111111-1111-4111-8111-111111111111',
    type: MediaAssetType.BANNER,
    status: MediaAssetStatus.PROCESSING,
    ownerId: null,
    catalogImageId: null,
    storageProvider: 'local',
    originalKey: 'media/banner/id/original.png',
    originalUrl: '/media/banner/id/original.png',
    originalFilename: 'banner.png',
    mimeType: 'image/png',
    sizeBytes: 100,
    width: 1_600,
    height: 900,
    variants: null,
    altText: null,
    position: 0,
    linkUrl: null,
    startsAt: null,
    endsAt: null,
    isActive: true,
    processingError: null,
    createdByStaffUserId: '22222222-2222-4222-8222-222222222222',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const prisma = {
    mediaAsset: {
      findUniqueOrThrow: jest.fn(() => asset),
      update: jest.fn((input: { data: object }) => ({ ...asset, ...input.data })),
    },
  };
  const storage = {
    name: 'local',
    read: jest.fn(() => Buffer.from('source')),
    upload: jest.fn((input: { key: string }) => ({ key: input.key, url: `/${input.key}` })),
    delete: jest.fn(),
    getUrl: jest.fn(),
  };
  const processor = {
    inspect: jest.fn(() => ({ format: 'png', width: 1_600, height: 900 })),
    createVariants: jest.fn(() =>
      Promise.resolve([
        {
          name: 'thumbnail',
          body: Buffer.from('thumbnail'),
          width: 320,
          height: 180,
          mimeType: 'image/webp',
          extension: 'webp',
        },
        {
          name: 'medium',
          body: Buffer.from('medium'),
          width: 1_280,
          height: 720,
          mimeType: 'image/webp',
          extension: 'webp',
        },
      ]),
    ),
  };
  const job = new ImageResizingJob(
    prisma as unknown as PrismaService,
    storage as unknown as FileStorage,
    processor as unknown as ImageProcessor,
  );

  beforeEach(() => jest.clearAllMocks());

  it('writes both variants and marks the asset ready', async () => {
    await job.handle(asset.id);

    expect(storage.upload).toHaveBeenCalledTimes(2);
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: asset.id },
      data: expect.objectContaining({
        status: MediaAssetStatus.READY,
        variants: expect.objectContaining({
          thumbnail: expect.objectContaining({ width: 320 }) as Record<string, unknown>,
          medium: expect.objectContaining({ width: 1_280 }) as Record<string, unknown>,
        }) as Record<string, unknown>,
      }) as Record<string, unknown>,
    });
  });

  it('marks the asset failed when processing cannot complete', async () => {
    processor.createVariants.mockRejectedValueOnce(new Error('resize failed'));

    await expect(job.handle(asset.id)).rejects.toThrow('resize failed');
    expect(prisma.mediaAsset.update).toHaveBeenLastCalledWith({
      where: { id: asset.id },
      data: {
        status: MediaAssetStatus.FAILED,
        processingError: 'resize failed',
      },
    });
  });
});
