import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentStaff } from '../../auth/decorators/current-staff.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { StaffAuthGuard } from '../../auth/guards/staff-auth.guard';
import { Permission } from '../../auth/permissions/permission';
import { AuthenticatedStaff } from '../../auth/types/authenticated-staff';
import { ListReturnRequestsQueryDto } from '../dto/list-return-requests-query.dto';
import { ReviewReturnRequestDto } from '../dto/review-return-request.dto';
import { ReturnsService } from '../services/returns.service';

@ApiTags('admin returns')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.ManageOrders)
@Controller({ path: 'admin/returns', version: '1' })
export class AdminReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  list(@Query() query: ListReturnRequestsQueryDto) {
    return this.returnsService.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.returnsService.getAdmin(id);
  }

  @Patch(':id/review')
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewReturnRequestDto,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    return this.returnsService.review(id, dto, staff);
  }

  @Post(':id/replacement-order')
  createReplacement(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    return this.returnsService.createReplacementOrder(id, staff);
  }
}
