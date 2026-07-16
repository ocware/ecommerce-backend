import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentCustomer } from '../../customers/decorators/current-customer.decorator';
import { CustomerAuthGuard } from '../../customers/guards/customer-auth.guard';
import { AuthenticatedCustomer } from '../../customers/types/authenticated-customer';
import { AddCartItemDto } from '../dto/add-cart-item.dto';
import { CreateCartDto } from '../dto/create-cart.dto';
import { MergeGuestCartDto } from '../dto/merge-guest-cart.dto';
import { UpdateCartItemDto } from '../dto/update-cart-item.dto';
import { CartService } from '../services/cart.service';

@ApiTags('store customer cart')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller({ path: 'store/cart', version: '1' })
export class StoreCustomerCartController {
  constructor(private readonly cartService: CartService) {}

  @Post()
  createCart(@Body() dto: CreateCartDto, @CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.cartService.createCustomerCart(dto, customer);
  }

  @Get(':id')
  getCart(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.cartService.getCustomerCart(id, customer);
  }

  @Post(':id/items')
  addItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCartItemDto,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.cartService.addCustomerItem(id, dto, customer);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateCartItemDto,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.cartService.updateCustomerItem(id, itemId, dto, customer);
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.cartService.removeCustomerItem(id, itemId, customer);
  }

  @Post(':id/merge')
  mergeGuestCart(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MergeGuestCartDto,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.cartService.mergeGuestCart(id, dto, customer);
  }
}
