import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { FileStorage, StoreFileInput, StoredFile } from '../contracts/file-storage';

@Injectable()
export class LocalFileStorage implements FileStorage {
  readonly name = 'local';
  private readonly root: string;
  private readonly publicBaseUrl: string;

  constructor(configService: ConfigService) {
    const configuredRoot = configService.get<string>('app.mediaLocalRoot') ?? 'storage/media';
    this.root = isAbsolute(configuredRoot)
      ? resolve(configuredRoot)
      : resolve(process.cwd(), configuredRoot);
    this.publicBaseUrl = (configService.get<string>('app.mediaPublicBaseUrl') ?? '/media').replace(
      /\/$/,
      '',
    );
  }

  async upload(input: StoreFileInput): Promise<StoredFile> {
    const path = this.resolveKey(input.key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.body, { flag: 'wx' });
    return { key: input.key, url: this.getUrl(input.key) };
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  getUrl(key: string): string {
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return `${this.publicBaseUrl}/${encodedKey}`;
  }

  private resolveKey(key: string): string {
    const path = resolve(this.root, key);
    const relativePath = relative(this.root, path);
    if (!relativePath || relativePath.startsWith(`..${sep}`) || relativePath === '..') {
      throw new Error('Storage key must identify a file beneath the configured media root.');
    }
    return path;
  }
}
