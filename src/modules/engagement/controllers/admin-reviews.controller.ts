import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentStaff } from '../../auth/decorators/current-staff.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { StaffAuthGuard } from '../../auth/guards/staff-auth.guard';
import { Permission } from '../../auth/permissions/permission';
import { AuthenticatedStaff } from '../../auth/types/authenticated-staff';
import { ListReviewsQueryDto } from '../dto/list-reviews-query.dto';
import { ModerateReviewDto } from '../dto/moderate-review.dto';
import { EngagementService } from '../services/engagement.service';

@ApiTags('admin reviews')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.ManageProducts)
@Controller({ path: 'admin/reviews', version: '1' })
export class AdminReviewsController {
  constructor(private readonly engagement: EngagementService) {}

  @Get()
  list(@Query() query: ListReviewsQueryDto) {
    return this.engagement.listAdminReviews(query);
  }

  @Patch(':id/moderation')
  moderate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerateReviewDto,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    return this.engagement.moderateReview(id, dto.status, staff.id);
  }
}
