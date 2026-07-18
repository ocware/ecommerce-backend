import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LocalFileStorage } from './local-file-storage.adapter';

describe('LocalFileStorage', () => {
  let root: string;
  let storage: LocalFileStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ecommerce-media-'));
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'app.mediaLocalRoot') return root;
        if (key === 'app.mediaPublicBaseUrl') return '/media';
        return undefined;
      }),
    };
    storage = new LocalFileStorage(config as unknown as ConfigService);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stores, reads, exposes, and idempotently deletes a file', async () => {
    const stored = await storage.upload({
      key: 'product-images/item/original.png',
      body: Buffer.from('image-data'),
      contentType: 'image/png',
    });

    expect(stored.url).toBe('/media/product-images/item/original.png');
    await expect(storage.read(stored.key)).resolves.toEqual(Buffer.from('image-data'));
    await storage.delete(stored.key);
    await storage.delete(stored.key);
    await expect(storage.read(stored.key)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects storage keys that escape the configured root', async () => {
    await expect(
      storage.upload({
        key: '../outside.png',
        body: Buffer.from('image-data'),
        contentType: 'image/png',
      }),
    ).rejects.toThrow('beneath the configured media root');
  });
});
