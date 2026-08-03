import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CmsService } from '../services/cms.service';

@ApiTags('store content')
@Controller({ path: 'store/content', version: '1' })
export class StoreCmsController {
  constructor(private readonly cms: CmsService) {}

  @Get('home')
  home() {
    return this.cms.getPublicHome();
  }

  @Get('pages/:slug')
  page(@Param('slug') slug: string) {
    return this.cms.getPublicPage(slug);
  }
}
