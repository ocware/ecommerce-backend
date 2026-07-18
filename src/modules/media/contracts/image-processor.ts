export const IMAGE_PROCESSOR = Symbol('IMAGE_PROCESSOR');

export type ImageMetadata = {
  format: 'jpeg' | 'png' | 'webp';
  width: number;
  height: number;
};

export type ProcessedImage = {
  name: 'thumbnail' | 'medium';
  body: Buffer;
  width: number;
  height: number;
  mimeType: 'image/webp';
  extension: 'webp';
};

export interface ImageProcessor {
  inspect(body: Buffer): Promise<ImageMetadata>;
  createVariants(body: Buffer): Promise<ProcessedImage[]>;
}
