import { Injectable } from '@nestjs/common';

import {
  DiscountEvaluationContext,
  DiscountEvaluationResult,
  DiscountEvaluator,
} from '../contracts/discount-evaluator';

@Injectable()
export class NoopDiscountEvaluator implements DiscountEvaluator {
  evaluate(context: DiscountEvaluationContext): Promise<DiscountEvaluationResult> {
    void context;
    return Promise.resolve({
      discountTotal: '0.00',
      shippingDiscountTotal: '0.00',
      applications: [],
    });
  }
}
