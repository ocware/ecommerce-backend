import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { AuthenticatedCustomer } from '../types/authenticated-customer';

type CustomerRequest = {
  customer?: AuthenticatedCustomer;
};

export const CurrentCustomer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedCustomer | undefined => {
    const request = context.switchToHttp().getRequest<CustomerRequest>();
    return request.customer;
  },
);
