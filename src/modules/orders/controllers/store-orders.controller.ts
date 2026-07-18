import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentCustomer } from '../../customers/decorators/current-customer.decorator';
import { CustomerAuthGuard } from '../../customers/guards/customer-auth.guard';
import { AuthenticatedCustomer } from '../../customers/types/authenticated-customer';
import { CancelOrderDto } from '../dto/cancel-order.dto';
import { ListOrdersQueryDto } from '../dto/list-orders-query.dto';
import { OrdersService } from '../services/orders.service';

@ApiTags('store orders')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller({ path: 'store/orders', version: '1' })
export class StoreOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  listOrders(
    @Query() query: ListOrdersQueryDto,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.ordersService.listCustomerOrders(query, customer);
  }

  @Get(':id')
  getOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.ordersService.getCustomerOrder(id, customer);
  }

  @Patch(':id/cancellation')
  cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.ordersService.cancelCustomerOrder(id, dto, customer);
  }
}
