import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { OptionalFeature } from '../../../shared/features/feature-toggle';
import { RequireFeature } from '../../../shared/features/require-feature.decorator';
import { CurrentStaff } from '../../auth/decorators/current-staff.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { StaffAuthGuard } from '../../auth/guards/staff-auth.guard';
import { Permission } from '../../auth/permissions/permission';
import { AuthenticatedStaff } from '../../auth/types/authenticated-staff';
import { ListNotificationsQueryDto } from '../dto/list-notifications-query.dto';
import { NotificationDeliveryService } from '../services/notification-delivery.service';

@ApiTags('admin notifications')
@ApiBearerAuth()
@RequireFeature(OptionalFeature.NOTIFICATIONS)
@UseGuards(StaffAuthGuard, PermissionsGuard)
@Controller({ path: 'admin/notifications', version: '1' })
export class AdminNotificationsController {
  constructor(private readonly notifications: NotificationDeliveryService) {}

  @Get()
  list(@Query() query: ListNotificationsQueryDto) {
    return this.notifications.list(query);
  }

  @Patch(':id/read')
  markRead(@Param('id', ParseUUIDPipe) id: string, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.notifications.markRead(id, staff.id);
  }

  @Post(':id/retry')
  @RequirePermissions(Permission.ManageSettings)
  retry(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.retry(id);
  }
}
