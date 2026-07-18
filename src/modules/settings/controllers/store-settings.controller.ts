import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { SettingsService } from '../services/settings.service';

@ApiTags('store settings')
@Controller({ path: 'store/settings', version: '1' })
export class StoreSettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get() {
    return this.settingsService.get();
  }
}
