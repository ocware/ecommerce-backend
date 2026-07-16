import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CustomersModule } from '../customers/customers.module';
import { DISCOUNT_EVALUATOR } from './contracts/discount-evaluator';
import { AdminDiscountsController } from './controllers/admin-discounts.controller';
import { DiscountsService } from './services/discounts.service';

@Module({
  imports: [AuthModule, CatalogModule, CustomersModule],
  controllers: [AdminDiscountsController],
  providers: [
    DiscountsService,
    {
      provide: DISCOUNT_EVALUATOR,
      useExisting: DiscountsService,
    },
  ],
  exports: [DiscountsService, DISCOUNT_EVALUATOR],
})
export class DiscountsModule {}
