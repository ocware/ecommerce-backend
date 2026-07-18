import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OptionalFeature } from '../../../shared/features/feature-toggle';
import { RequireFeature } from '../../../shared/features/require-feature.decorator';
import { MediaService } from '../services/media.service';

@ApiTags('store media')
@RequireFeature(OptionalFeature.MEDIA)
@Controller({ path: 'store/media', version: '1' })
export class StoreMediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get('shop-logo')
  getShopLogo() {
    return this.mediaService.getShopLogo();
  }

  @Get('banners')
  listBanners() {
    return this.mediaService.listStoreBanners();
  }
}
