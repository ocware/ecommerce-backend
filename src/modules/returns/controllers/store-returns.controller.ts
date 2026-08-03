import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentCustomer } from '../../customers/decorators/current-customer.decorator';
import { CustomerAuthGuard } from '../../customers/guards/customer-auth.guard';
import { AuthenticatedCustomer } from '../../customers/types/authenticated-customer';
import { CreateReturnRequestDto } from '../dto/create-return-request.dto';
import { ListReturnRequestsQueryDto } from '../dto/list-return-requests-query.dto';
import { ReturnsService } from '../services/returns.service';

@ApiTags('store returns')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller({ path: 'store/returns', version: '1' })
export class StoreReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Post()
  create(
    @Body() dto: CreateReturnRequestDto,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.returnsService.create(dto, customer);
  }

  @Get()
  list(
    @Query() query: ListReturnRequestsQueryDto,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.returnsService.list(query, customer.id);
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.returnsService.getCustomer(id, customer.id);
  }

  @Patch(':id/cancellation')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.returnsService.cancel(id, customer.id);
  }
}
