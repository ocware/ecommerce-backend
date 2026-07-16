import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { StaffAuthGuard } from '../../auth/guards/staff-auth.guard';
import { Permission } from '../../auth/permissions/permission';
import { CreateDiscountDto } from '../dto/create-discount.dto';
import { ListDiscountsQueryDto } from '../dto/list-discounts-query.dto';
import { SetDiscountResourceIdsDto } from '../dto/set-discount-resource-ids.dto';
import { UpdateDiscountDto } from '../dto/update-discount.dto';
import { DiscountsService } from '../services/discounts.service';

@ApiTags('admin discounts')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.ManageDiscounts)
@Controller({ path: 'admin/discounts', version: '1' })
export class AdminDiscountsController {
  constructor(private readonly discountsService: DiscountsService) {}

  @Post()
  createDiscount(@Body() dto: CreateDiscountDto) {
    return this.discountsService.createDiscount(dto);
  }

  @Get()
  listDiscounts(@Query() query: ListDiscountsQueryDto) {
    return this.discountsService.listDiscounts(query);
  }

  @Get(':id')
  findDiscount(@Param('id', ParseUUIDPipe) id: string) {
    return this.discountsService.findDiscount(id);
  }

  @Patch(':id')
  updateDiscount(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDiscountDto) {
    return this.discountsService.updateDiscount(id, dto);
  }

  @Put(':id/products')
  setProductRestrictions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetDiscountResourceIdsDto,
  ) {
    return this.discountsService.setProductRestrictions(id, dto);
  }

  @Put(':id/categories')
  setCategoryRestrictions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetDiscountResourceIdsDto,
  ) {
    return this.discountsService.setCategoryRestrictions(id, dto);
  }

  @Put(':id/customers')
  setCustomerRestrictions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetDiscountResourceIdsDto,
  ) {
    return this.discountsService.setCustomerRestrictions(id, dto);
  }
}
