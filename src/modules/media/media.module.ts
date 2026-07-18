import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { LocalFileStorage } from './adapters/local-file-storage.adapter';
import { S3FileStorage } from './adapters/s3-file-storage.adapter';
import { SharpImageProcessor } from './adapters/sharp-image-processor.adapter';
import { AdminMediaController } from './controllers/admin-media.controller';
import { StoreMediaController } from './controllers/store-media.controller';
import { FILE_STORAGE } from './contracts/file-storage';
import { IMAGE_PROCESSOR } from './contracts/image-processor';
import { ImageResizingJob } from './jobs/image-resizing.job';
import { MediaService } from './services/media.service';

@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [AdminMediaController, StoreMediaController],
  providers: [
    LocalFileStorage,
    S3FileStorage,
    SharpImageProcessor,
    {
      provide: FILE_STORAGE,
      inject: [ConfigService, LocalFileStorage, S3FileStorage],
      useFactory: (
        configService: ConfigService,
        localStorage: LocalFileStorage,
        s3Storage: S3FileStorage,
      ) =>
        configService.get<string>('app.mediaStorageDriver') === 's3' ? s3Storage : localStorage,
    },
    { provide: IMAGE_PROCESSOR, useExisting: SharpImageProcessor },
    ImageResizingJob,
    MediaService,
  ],
  exports: [MediaService, ImageResizingJob, FILE_STORAGE],
})
export class MediaModule {}
