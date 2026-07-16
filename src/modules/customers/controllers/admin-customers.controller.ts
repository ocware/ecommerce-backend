import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentStaff } from '../../auth/decorators/current-staff.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { StaffAuthGuard } from '../../auth/guards/staff-auth.guard';
import { Permission } from '../../auth/permissions/permission';
import { AuthenticatedStaff } from '../../auth/types/authenticated-staff';
import { AddCustomerNoteDto } from '../dto/add-customer-note.dto';
import { UpdateCustomerStatusDto } from '../dto/update-customer-status.dto';
import { CustomersService } from '../services/customers.service';

@ApiTags('admin customers')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, PermissionsGuard)
@Controller({
  path: 'admin/customers',
  version: '1',
})
export class AdminCustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermissions(Permission.ManageCustomers)
  listCustomers() {
    return this.customersService.listCustomers();
  }

  @Get(':id')
  @RequirePermissions(Permission.ManageCustomers)
  findCustomer(@Param('id') id: string) {
    return this.customersService.findCustomer(id);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.ManageCustomers)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateCustomerStatusDto) {
    return this.customersService.updateCustomerStatus(id, dto);
  }

  @Get(':id/notes')
  @RequirePermissions(Permission.ManageCustomers)
  listNotes(@Param('id') id: string) {
    return this.customersService.listNotes(id);
  }

  @Post(':id/notes')
  @RequirePermissions(Permission.ManageCustomers)
  addNote(
    @Param('id') id: string,
    @Body() dto: AddCustomerNoteDto,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    return this.customersService.addNote(id, dto, staff);
  }
}
