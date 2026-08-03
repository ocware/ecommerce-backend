import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CustomersModule } from '../customers/customers.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SettingsModule } from '../settings/settings.module';
import { AdminReturnsController } from './controllers/admin-returns.controller';
import { StoreReturnsController } from './controllers/store-returns.controller';
import { ReturnsService } from './services/returns.service';

@Module({
  imports: [AuthModule, CustomersModule, InventoryModule, SettingsModule],
  controllers: [StoreReturnsController, AdminReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
