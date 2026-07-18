import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { FileStorage, StoreFileInput, StoredFile } from '../contracts/file-storage';

@Injectable()
export class S3FileStorage implements FileStorage {
  readonly name = 's3';
  private readonly bucket?: string;
  private readonly publicBaseUrl?: string;
  private readonly client: S3Client;

  constructor(configService: ConfigService) {
    const accessKeyId = configService.get<string>('app.mediaS3AccessKeyId');
    const secretAccessKey = configService.get<string>('app.mediaS3SecretAccessKey');
    this.bucket = configService.get<string>('app.mediaS3Bucket');
    this.publicBaseUrl = configService.get<string>('app.mediaS3PublicBaseUrl')?.replace(/\/$/, '');
    this.client = new S3Client({
      region: configService.get<string>('app.mediaS3Region') ?? 'us-east-1',
      endpoint: configService.get<string>('app.mediaS3Endpoint'),
      forcePathStyle: configService.get<boolean>('app.mediaS3ForcePathStyle') ?? false,
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    });
  }

  async upload(input: StoreFileInput): Promise<StoredFile> {
    const bucket = this.requireBucket();
    const result = await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: input.cacheControl,
      }),
    );
    return { key: input.key, url: this.getUrl(input.key), etag: result.ETag };
  }

  async read(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.requireBucket(), Key: key }),
    );
    if (!result.Body) {
      throw new Error(`Object ${key} returned an empty body.`);
    }
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.requireBucket(), Key: key }));
  }

  getUrl(key: string): string {
    if (!this.publicBaseUrl) {
      throw new Error('MEDIA_S3_PUBLIC_BASE_URL is required for the S3 media driver.');
    }
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return `${this.publicBaseUrl}/${encodedKey}`;
  }

  private requireBucket(): string {
    if (!this.bucket) {
      throw new Error('MEDIA_S3_BUCKET is required for the S3 media driver.');
    }
    return this.bucket;
  }
}
