import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { StaffAuthGuard } from '../../auth/guards/staff-auth.guard';
import { Permission } from '../../auth/permissions/permission';
import { ReportRangeQueryDto } from '../../reports/dto/report-range-query.dto';
import { AnalyticsService } from '../services/analytics.service';

@ApiTags('admin analytics')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.ViewReports)
@Controller({ path: 'admin/analytics', version: '1' })
export class AdminAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('funnel')
  funnel(@Query() query: ReportRangeQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
    return this.analytics.getFunnel(from, to);
  }
}
