import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { Permission } from '../permissions/permission';
import { roleHasPermission } from '../permissions/role-permissions';
import { AuthenticatedStaff } from '../types/authenticated-staff';

type StaffRequest = {
  staff?: AuthenticatedStaff;
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permissions = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!permissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<StaffRequest>();
    const staff = request.staff;
    const hasPermissions = staff
      ? permissions.every((permission) => roleHasPermission(staff.role, permission))
      : false;

    if (!hasPermissions) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_PERMISSION',
        message: 'This staff account does not have the required permission.',
      });
    }

    return true;
  }
}
