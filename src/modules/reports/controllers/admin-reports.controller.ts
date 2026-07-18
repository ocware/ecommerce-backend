import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { StaffAuthGuard } from '../../auth/guards/staff-auth.guard';
import { Permission } from '../../auth/permissions/permission';
import { BestSellingProductsQueryDto } from '../dto/best-selling-products-query.dto';
import { LowStockReportQueryDto } from '../dto/low-stock-report-query.dto';
import { ReportRangeQueryDto } from '../dto/report-range-query.dto';
import { ReportsService } from '../services/reports.service';

@ApiTags('admin reports')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.ViewReports)
@Controller({ path: 'admin/reports', version: '1' })
export class AdminReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('overview')
  overview(@Query() query: ReportRangeQueryDto) {
    return this.reportsService.getOverview(query);
  }

  @Get('sales-by-date')
  salesByDate(@Query() query: ReportRangeQueryDto) {
    return this.reportsService.getSalesByDate(query);
  }

  @Get('best-selling-products')
  bestSellingProducts(@Query() query: BestSellingProductsQueryDto) {
    return this.reportsService.getBestSellingProducts(query);
  }

  @Get('low-stock-products')
  lowStockProducts(@Query() query: LowStockReportQueryDto) {
    return this.reportsService.getLowStockProducts(query);
  }

  @Get('payment-status')
  paymentStatus(@Query() query: ReportRangeQueryDto) {
    return this.reportsService.getPaymentStatusSummary(query);
  }

  @Get('refunds')
  refunds(@Query() query: ReportRangeQueryDto) {
    return this.reportsService.getRefundSummary(query);
  }
}
