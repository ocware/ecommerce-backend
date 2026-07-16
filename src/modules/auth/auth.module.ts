import { Module } from '@nestjs/common';

import { AdminAuthController } from './controllers/admin-auth.controller';
import { AdminStaffController } from './controllers/admin-staff.controller';
import { PermissionsGuard } from './guards/permissions.guard';
import { RolesGuard } from './guards/roles.guard';
import { StaffAuthGuard } from './guards/staff-auth.guard';
import { AuditLogService } from './services/audit-log.service';
import { AuthService } from './services/auth.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';

@Module({
  controllers: [AdminAuthController, AdminStaffController],
  providers: [
    AuthService,
    AuditLogService,
    PasswordService,
    TokenService,
    StaffAuthGuard,
    RolesGuard,
    PermissionsGuard,
  ],
  exports: [AuthService, StaffAuthGuard, RolesGuard, PermissionsGuard],
})
export class AuthModule {}
