import {
  Body,
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

import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { StaffAuthGuard } from '../../auth/guards/staff-auth.guard';
import { Permission } from '../../auth/permissions/permission';
import { CreateShipmentDto } from '../dto/create-shipment.dto';
import { ListShipmentsQueryDto } from '../dto/list-shipments-query.dto';
import { UpdateShipmentStatusDto } from '../dto/update-shipment-status.dto';
import { ShippingService } from '../services/shipping.service';

@ApiTags('admin shipments')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.ManageOrders)
@Controller({ path: 'admin/shipments', version: '1' })
export class AdminShipmentsController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get()
  listShipments(@Query() query: ListShipmentsQueryDto) {
    return this.shippingService.listAdminShipments(query);
  }

  @Post()
  createShipment(@Body() dto: CreateShipmentDto) {
    return this.shippingService.createShipment(dto);
  }

  @Get(':id')
  getShipment(@Param('id', ParseUUIDPipe) id: string) {
    return this.shippingService.getAdminShipment(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShipmentStatusDto) {
    return this.shippingService.updateStatus(id, dto);
  }

  @Post(':id/tracking-refresh')
  trackShipment(@Param('id', ParseUUIDPipe) id: string) {
    return this.shippingService.trackShipment(id);
  }

  @Post(':id/cancellation')
  cancelShipment(@Param('id', ParseUUIDPipe) id: string) {
    return this.shippingService.cancelShipment(id);
  }
}
