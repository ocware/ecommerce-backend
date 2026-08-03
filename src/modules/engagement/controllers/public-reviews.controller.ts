import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { EngagementService } from '../services/engagement.service';

@ApiTags('store reviews')
@Controller({ path: 'store/products', version: '1' })
export class PublicReviewsController {
  constructor(private readonly engagement: EngagementService) {}

  @Get(':slug/reviews')
  list(@Param('slug') slug: string) {
    return this.engagement.listProductReviews(slug);
  }
}
