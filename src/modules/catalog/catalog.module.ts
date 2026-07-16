import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AdminCatalogController } from './controllers/admin-catalog.controller';
import { StoreCatalogController } from './controllers/store-catalog.controller';
import { CatalogService } from './services/catalog.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminCatalogController, StoreCatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
