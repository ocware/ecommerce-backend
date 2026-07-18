import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { MediaService } from '../services/media.service';

@ApiTags('store media')
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
