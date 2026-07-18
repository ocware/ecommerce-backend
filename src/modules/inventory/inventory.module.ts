import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AdminInventoryController } from './controllers/admin-inventory.controller';
import { StoreInventoryController } from './controllers/store-inventory.controller';
import { InventoryService } from './services/inventory.service';
import { InventoryEventPublisher } from './services/inventory-event-publisher.service';

@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [AdminInventoryController, StoreInventoryController],
  providers: [InventoryService, InventoryEventPublisher],
  exports: [InventoryService, InventoryEventPublisher],
})
export class InventoryModule {}
