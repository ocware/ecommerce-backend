import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentStaff } from '../decorators/current-staff.decorator';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { CreateStaffUserDto } from '../dto/create-staff-user.dto';
import { StaffAuthGuard } from '../guards/staff-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { Permission } from '../permissions/permission';
import { AuthService } from '../services/auth.service';
import { AuthenticatedStaff } from '../types/authenticated-staff';

@ApiTags('admin staff')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, PermissionsGuard)
@Controller({
  path: 'admin/staff',
  version: '1',
})
export class AdminStaffController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  @RequirePermissions(Permission.ManageStaff)
  listStaffUsers() {
    return this.authService.listStaffUsers();
  }

  @Get(':id')
  @RequirePermissions(Permission.ManageStaff)
  findStaffUser(@Param('id') id: string) {
    return this.authService.findStaffById(id);
  }

  @Post()
  @RequirePermissions(Permission.ManageStaff)
  createStaffUser(@Body() dto: CreateStaffUserDto, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.authService.createStaffUser(dto, staff);
  }
}
