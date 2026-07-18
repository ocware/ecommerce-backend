import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AdminReportsController } from './controllers/admin-reports.controller';
import { ReportsService } from './services/reports.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
