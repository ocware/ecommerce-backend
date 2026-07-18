import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';

import { ImageMetadata, ImageProcessor, ProcessedImage } from '../contracts/image-processor';

const allowedFormats = new Set(['jpeg', 'png', 'webp']);
const maximumDimension = 10_000;

@Injectable()
export class SharpImageProcessor implements ImageProcessor {
  async inspect(body: Buffer): Promise<ImageMetadata> {
    let metadata: unknown;
    try {
      metadata = await sharp(body, { failOn: 'error' }).metadata();
    } catch {
      throw this.invalidImage('The uploaded file is not a readable image.');
    }

    if (!this.isSupportedMetadata(metadata)) {
      throw this.invalidImage('Only JPEG, PNG, and WebP images are supported.');
    }
    if (metadata.width > maximumDimension || metadata.height > maximumDimension) {
      throw this.invalidImage(`Image dimensions cannot exceed ${maximumDimension}px.`);
    }

    return {
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
    };
  }

  async createVariants(body: Buffer): Promise<ProcessedImage[]> {
    return Promise.all([
      this.resize(body, 'thumbnail', 320, 320),
      this.resize(body, 'medium', 1280, 1280),
    ]);
  }

  private async resize(
    body: Buffer,
    name: ProcessedImage['name'],
    width: number,
    height: number,
  ): Promise<ProcessedImage> {
    const { data, info } = await sharp(body, { failOn: 'error' })
      .rotate()
      .resize({ width, height, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    return {
      name,
      body: data,
      width: info.width,
      height: info.height,
      mimeType: 'image/webp',
      extension: 'webp',
    };
  }

  private invalidImage(message: string): BadRequestException {
    return new BadRequestException({ code: 'INVALID_MEDIA_FILE', message });
  }

  private isSupportedMetadata(
    value: unknown,
  ): value is { format: ImageMetadata['format']; width: number; height: number } {
    if (typeof value !== 'object' || value === null) return false;
    const metadata = value as Record<string, unknown>;
    return (
      typeof metadata.format === 'string' &&
      allowedFormats.has(metadata.format) &&
      typeof metadata.width === 'number' &&
      metadata.width > 0 &&
      typeof metadata.height === 'number' &&
      metadata.height > 0
    );
  }
}
