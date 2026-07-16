import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedStaff } from '../types/authenticated-staff';
import { StaffRole } from '../types/staff-role';

type StaffRequest = {
  staff?: AuthenticatedStaff;
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<StaffRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<StaffRequest>();
    const staff = request.staff;

    if (!staff || !requiredRoles.includes(staff.role)) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: 'This staff account does not have the required role.',
      });
    }

    return true;
  }
}
