import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { StaffAuthGuard } from '../../auth/guards/staff-auth.guard';
import { Permission } from '../../auth/permissions/permission';
import { CreateShippingMethodDto } from '../dto/create-shipping-method.dto';
import { CreateShippingZoneDto } from '../dto/create-shipping-zone.dto';
import { UpdateShippingMethodDto } from '../dto/update-shipping-method.dto';
import { UpdateShippingZoneDto } from '../dto/update-shipping-zone.dto';
import { UpsertShippingRateDto } from '../dto/upsert-shipping-rate.dto';
import { ShippingRatesService } from '../services/shipping-rates.service';

@ApiTags('admin shipping configuration')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.ManageSettings)
@Controller({ path: 'admin/shipping', version: '1' })
export class AdminShippingConfigurationController {
  constructor(private readonly shippingRatesService: ShippingRatesService) {}

  @Get('methods')
  listMethods() {
    return this.shippingRatesService.listMethods(true);
  }

  @Post('methods')
  createMethod(@Body() dto: CreateShippingMethodDto) {
    return this.shippingRatesService.createMethod(dto);
  }

  @Patch('methods/:id')
  updateMethod(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShippingMethodDto) {
    return this.shippingRatesService.updateMethod(id, dto);
  }

  @Get('zones')
  listZones() {
    return this.shippingRatesService.listZones();
  }

  @Post('zones')
  createZone(@Body() dto: CreateShippingZoneDto) {
    return this.shippingRatesService.createZone(dto);
  }

  @Patch('zones/:id')
  updateZone(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShippingZoneDto) {
    return this.shippingRatesService.updateZone(id, dto);
  }

  @Put('methods/:methodId/zones/:zoneId/rate')
  upsertRate(
    @Param('methodId', ParseUUIDPipe) methodId: string,
    @Param('zoneId', ParseUUIDPipe) zoneId: string,
    @Body() dto: UpsertShippingRateDto,
  ) {
    return this.shippingRatesService.upsertRate(methodId, zoneId, dto);
  }
}
