import { SetMetadata } from '@nestjs/common';

import { StaffRole } from '../types/staff-role';

export const ROLES_KEY = 'roles';

export const RequireRoles = (...roles: StaffRole[]) => SetMetadata(ROLES_KEY, roles);
