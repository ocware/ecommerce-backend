import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';

import { CurrentStaff } from '../../auth/decorators/current-staff.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { StaffAuthGuard } from '../../auth/guards/staff-auth.guard';
import { Permission } from '../../auth/permissions/permission';
import { AuthenticatedStaff } from '../../auth/types/authenticated-staff';
import { CreateRefundDto } from '../dto/create-refund.dto';
import { VerifyPaymentDto } from '../dto/verify-payment.dto';
import { PaymentsService } from '../services/payments.service';

@ApiTags('admin payments')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.ManageOrders)
@Controller({ path: 'admin/payments', version: '1' })
export class AdminPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('attempts/:id')
  getAttempt(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.getAdminAttempt(id);
  }

  @Post('attempts/:id/verification')
  verifyAttempt(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VerifyPaymentDto) {
    return this.paymentsService.verifyAdminAttempt(id, dto);
  }

  @Post('attempts/:id/refunds')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  createRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRefundDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    return this.paymentsService.createRefund(id, dto, idempotencyKey, staff);
  }
}
