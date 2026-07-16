import { DiscountType } from '@prisma/client';

export const DISCOUNT_EVALUATOR = Symbol('DISCOUNT_EVALUATOR');

export type DiscountEvaluationItem = {
  variantId: string;
  productId: string;
  categoryIds: string[];
  quantity: number;
  unitPrice: string;
  lineSubtotal: string;
};

export type DiscountEvaluationContext = {
  currency: string;
  customerId: string | null;
  code: string | null;
  items: DiscountEvaluationItem[];
  subtotal: string;
};

export type DiscountApplication = {
  discountId: string;
  code: string;
  label: string;
  type: DiscountType;
  amount: string;
};

export type DiscountEvaluationResult = {
  discountTotal: string;
  shippingDiscountTotal: string;
  freeShipping: boolean;
  applications: DiscountApplication[];
};

export interface DiscountEvaluator {
  evaluate(context: DiscountEvaluationContext): Promise<DiscountEvaluationResult>;
}
