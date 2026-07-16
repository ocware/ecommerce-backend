import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { AuthenticatedStaff } from '../types/authenticated-staff';

type StaffRequest = {
  staff?: AuthenticatedStaff;
};

export const CurrentStaff = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedStaff | undefined => {
    const request = context.switchToHttp().getRequest<StaffRequest>();
    return request.staff;
  },
);
