import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AdminCmsController } from './controllers/admin-cms.controller';
import { StoreCmsController } from './controllers/store-cms.controller';
import { CmsService } from './services/cms.service';

@Module({
  imports: [AuthModule],
  controllers: [StoreCmsController, AdminCmsController],
  providers: [CmsService],
  exports: [CmsService],
})
export class CmsModule {}
