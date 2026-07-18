import { PartialType } from '@nestjs/swagger';

import { UploadBannerDto } from './upload-banner.dto';

export class UpdateBannerDto extends PartialType(UploadBannerDto) {}
