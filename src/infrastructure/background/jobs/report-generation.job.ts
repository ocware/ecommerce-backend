import { Injectable } from '@nestjs/common';

import { ReportsService } from '../../../modules/reports/services/reports.service';
import { ReportJobData } from '../background-job.types';

@Injectable()
export class ReportGenerationJob {
  constructor(private readonly reports: ReportsService) {}

  handle(data: ReportJobData) {
    const query = data.query ?? {};
    switch (data.report) {
      case 'overview':
        return this.reports.getOverview(query);
      case 'sales-by-date':
        return this.reports.getSalesByDate(query);
      case 'best-selling-products':
        return this.reports.getBestSellingProducts({
          ...query,
          limit: typeof query.limit === 'number' ? query.limit : 10,
        });
      case 'low-stock-products':
        return this.reports.getLowStockProducts({
          ...query,
          page: typeof query.page === 'number' ? query.page : 1,
          limit: typeof query.limit === 'number' ? query.limit : 20,
        });
      case 'payment-status':
        return this.reports.getPaymentStatusSummary(query);
      case 'refunds':
        return this.reports.getRefundSummary(query);
    }
  }
}
