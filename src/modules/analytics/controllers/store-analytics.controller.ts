import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { IngestAnalyticsEventsDto } from '../dto/ingest-analytics-events.dto';
import { RecordConsentDto } from '../dto/record-consent.dto';
import { AnalyticsService } from '../services/analytics.service';

@ApiTags('store analytics')
@Controller({ path: 'store', version: '1' })
export class StoreAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post('consents')
  consent(@Body() dto: RecordConsentDto) {
    return this.analytics.recordConsent(dto);
  }

  @Post('analytics/events')
  events(@Body() dto: IngestAnalyticsEventsDto) {
    return this.analytics.ingest(dto);
  }
}
