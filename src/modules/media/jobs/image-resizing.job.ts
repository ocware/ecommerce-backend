import { Inject, Injectable } from '@nestjs/common';
import { MediaAssetStatus } from '@prisma/client';
import { dirname } from 'node:path';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { FILE_STORAGE, FileStorage } from '../contracts/file-storage';
import { IMAGE_PROCESSOR, ImageProcessor } from '../contracts/image-processor';

export type MediaVariant = {
  key: string;
  url: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
};

export type MediaVariants = Record<'thumbnail' | 'medium', MediaVariant>;

@Injectable()
export class ImageResizingJob {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(IMAGE_PROCESSOR) private readonly imageProcessor: ImageProcessor,
  ) {}

  async handle(mediaAssetId: string) {
    const asset = await this.prisma.mediaAsset.findUniqueOrThrow({
      where: { id: mediaAssetId },
    });
    const uploadedKeys: string[] = [];

    try {
      const body = await this.storage.read(asset.originalKey);
      const metadata = await this.imageProcessor.inspect(body);
      const processedImages = await this.imageProcessor.createVariants(body);
      const variants = {} as MediaVariants;

      for (const image of processedImages) {
        const key = `${dirname(asset.originalKey)}/${image.name}.${image.extension}`;
        const stored = await this.storage.upload({
          key,
          body: image.body,
          contentType: image.mimeType,
          cacheControl: 'public, max-age=31536000, immutable',
        });
        uploadedKeys.push(stored.key);
        variants[image.name] = {
          key: stored.key,
          url: stored.url,
          mimeType: image.mimeType,
          width: image.width,
          height: image.height,
          sizeBytes: image.body.length,
        };
      }

      return this.prisma.mediaAsset.update({
        where: { id: mediaAssetId },
        data: {
          status: MediaAssetStatus.READY,
          width: metadata.width,
          height: metadata.height,
          variants,
          processingError: null,
        },
      });
    } catch (error) {
      await Promise.allSettled(uploadedKeys.map((key) => this.storage.delete(key)));
      await this.prisma.mediaAsset.update({
        where: { id: mediaAssetId },
        data: {
          status: MediaAssetStatus.FAILED,
          processingError: error instanceof Error ? error.message.slice(0, 1_000) : 'Unknown error',
        },
      });
      throw error;
    }
  }
}
