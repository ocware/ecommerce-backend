import { Injectable } from '@nestjs/common';

import { ImageResizingJob } from '../../../modules/media/jobs/image-resizing.job';

@Injectable()
export class ImageProcessingJob {
  constructor(private readonly imageResizing: ImageResizingJob) {}

  handle(data: { mediaAssetId: string }) {
    return this.imageResizing.handle(data.mediaAssetId);
  }
}
