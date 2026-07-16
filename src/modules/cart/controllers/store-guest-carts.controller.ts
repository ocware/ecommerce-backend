import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';

import { AddCartItemDto } from '../dto/add-cart-item.dto';
import { ApplyDiscountCodeDto } from '../dto/apply-discount-code.dto';
import { CreateCartDto } from '../dto/create-cart.dto';
import { UpdateCartItemDto } from '../dto/update-cart-item.dto';
import { CartService } from '../services/cart.service';

@ApiTags('store guest carts')
@Controller({ path: 'store/carts', version: '1' })
export class StoreGuestCartsController {
  constructor(private readonly cartService: CartService) {}

  @Post()
  createCart(@Body() dto: CreateCartDto) {
    return this.cartService.createGuestCart(dto);
  }

  @Get(':id')
  @ApiHeader({ name: 'x-cart-token', required: true })
  getCart(@Param('id', ParseUUIDPipe) id: string, @Headers('x-cart-token') guestToken?: string) {
    return this.cartService.getGuestCart(id, guestToken);
  }

  @Post(':id/items')
  @ApiHeader({ name: 'x-cart-token', required: true })
  addItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCartItemDto,
    @Headers('x-cart-token') guestToken?: string,
  ) {
    return this.cartService.addGuestItem(id, dto, guestToken);
  }

  @Patch(':id/items/:itemId')
  @ApiHeader({ name: 'x-cart-token', required: true })
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateCartItemDto,
    @Headers('x-cart-token') guestToken?: string,
  ) {
    return this.cartService.updateGuestItem(id, itemId, dto, guestToken);
  }

  @Delete(':id/items/:itemId')
  @ApiHeader({ name: 'x-cart-token', required: true })
  removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Headers('x-cart-token') guestToken?: string,
  ) {
    return this.cartService.removeGuestItem(id, itemId, guestToken);
  }

  @Put(':id/discount')
  @ApiHeader({ name: 'x-cart-token', required: true })
  applyDiscount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyDiscountCodeDto,
    @Headers('x-cart-token') guestToken?: string,
  ) {
    return this.cartService.applyGuestDiscount(id, dto, guestToken);
  }

  @Delete(':id/discount')
  @ApiHeader({ name: 'x-cart-token', required: true })
  removeDiscount(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-cart-token') guestToken?: string,
  ) {
    return this.cartService.removeGuestDiscount(id, guestToken);
  }
}
