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

import { CurrentStaff } from '../../auth/decorators/current-staff.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { StaffAuthGuard } from '../../auth/guards/staff-auth.guard';
import { Permission } from '../../auth/permissions/permission';
import { AuthenticatedStaff } from '../../auth/types/authenticated-staff';
import { AdjustInventoryDto } from '../dto/adjust-inventory.dto';
import { CreateStockReservationDto } from '../dto/create-stock-reservation.dto';
import { ExpireReservationsDto } from '../dto/expire-reservations.dto';
import { InitializeInventoryDto } from '../dto/initialize-inventory.dto';
import { ListInventoryQueryDto } from '../dto/list-inventory-query.dto';
import { ListStockMovementsQueryDto } from '../dto/list-stock-movements-query.dto';
import { RestoreStockDto } from '../dto/restore-stock.dto';
import { UpdateLowStockThresholdDto } from '../dto/update-low-stock-threshold.dto';
import { InventoryService } from '../services/inventory.service';

@ApiTags('admin inventory')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.ManageInventory)
@Controller({ path: 'admin/inventory', version: '1' })
export class AdminInventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  initializeInventory(
    @Body() dto: InitializeInventoryDto,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    return this.inventoryService.initializeInventory(dto, staff.id);
  }

  @Get()
  listInventory(@Query() query: ListInventoryQueryDto) {
    return this.inventoryService.listInventory(query);
  }

  @Get('low-stock')
  listLowStock(@Query() query: ListInventoryQueryDto) {
    query.lowStock = true;
    return this.inventoryService.listInventory(query);
  }

  @Post('reservations')
  createReservation(@Body() dto: CreateStockReservationDto) {
    return this.inventoryService.reserveStock(dto);
  }

  @Post('reservations/expire')
  expireReservations(@Body() dto: ExpireReservationsDto) {
    return this.inventoryService.expireReservations(dto.limit);
  }

  @Post('reservations/:id/confirm')
  confirmReservation(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.confirmReservation(id);
  }

  @Post('reservations/:id/release')
  releaseReservation(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.releaseReservation(id);
  }

  @Get(':variantId')
  getInventory(@Param('variantId', ParseUUIDPipe) variantId: string) {
    return this.inventoryService.getInventory(variantId);
  }

  @Patch(':variantId/low-stock-threshold')
  updateLowStockThreshold(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateLowStockThresholdDto,
  ) {
    return this.inventoryService.updateLowStockThreshold(variantId, dto);
  }

  @Post(':variantId/adjustments')
  adjustStock(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: AdjustInventoryDto,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    return this.inventoryService.adjustStock(variantId, dto, staff.id);
  }

  @Post(':variantId/restorations')
  restoreStock(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: RestoreStockDto,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    return this.inventoryService.restoreStock(variantId, dto, staff.id);
  }

  @Get(':variantId/movements')
  listMovements(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Query() query: ListStockMovementsQueryDto,
  ) {
    return this.inventoryService.listMovements(variantId, query);
  }
}
