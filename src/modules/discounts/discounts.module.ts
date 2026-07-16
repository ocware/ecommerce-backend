import { Module } from '@nestjs/common';

import { DISCOUNT_EVALUATOR } from './contracts/discount-evaluator';
import { NoopDiscountEvaluator } from './services/noop-discount-evaluator.service';

@Module({
  providers: [
    NoopDiscountEvaluator,
    {
      provide: DISCOUNT_EVALUATOR,
      useExisting: NoopDiscountEvaluator,
    },
  ],
  exports: [DISCOUNT_EVALUATOR],
})
export class DiscountsModule {}
