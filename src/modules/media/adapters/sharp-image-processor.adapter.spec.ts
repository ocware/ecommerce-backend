import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

import { SharpImageProcessor } from './sharp-image-processor.adapter';

describe('SharpImageProcessor', () => {
  const processor = new SharpImageProcessor();

  it('validates decoded content and creates bounded WebP variants', async () => {
    const source = await sharp({
      create: { width: 1_600, height: 900, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();

    await expect(processor.inspect(source)).resolves.toEqual({
      format: 'png',
      width: 1_600,
      height: 900,
    });
    const variants = await processor.createVariants(source);

    expect(
      variants.map(({ name, width, height, mimeType }) => ({
        name,
        width,
        height,
        mimeType,
      })),
    ).toEqual([
      { name: 'thumbnail', width: 320, height: 180, mimeType: 'image/webp' },
      { name: 'medium', width: 1_280, height: 720, mimeType: 'image/webp' },
    ]);
  });

  it('rejects content that only claims to be an image', async () => {
    await expect(processor.inspect(Buffer.from('not-an-image'))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
