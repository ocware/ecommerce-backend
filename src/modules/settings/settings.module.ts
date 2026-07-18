import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ShippingRatesModule } from '../shipping/shipping-rates.module';
import { AdminSettingsController } from './controllers/admin-settings.controller';
import { StoreSettingsController } from './controllers/store-settings.controller';
import { SettingsService } from './services/settings.service';

@Module({
  imports: [AuthModule, ShippingRatesModule],
  controllers: [AdminSettingsController, StoreSettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
