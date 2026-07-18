import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';

import { CurrentCustomer } from '../../customers/decorators/current-customer.decorator';
import { CustomerAuthGuard } from '../../customers/guards/customer-auth.guard';
import { AuthenticatedCustomer } from '../../customers/types/authenticated-customer';
import { CheckoutDto } from '../dto/checkout.dto';
import { OrdersService } from '../services/orders.service';

@ApiTags('store checkout')
@Controller({ path: 'store/checkout', version: '1' })
export class StoreCheckoutController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(CustomerAuthGuard)
  checkoutCustomer(@Body() dto: CheckoutDto, @CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.ordersService.checkoutCustomer(dto, customer);
  }

  @Post('guest')
  @ApiHeader({ name: 'x-cart-token', required: true })
  checkoutGuest(@Body() dto: CheckoutDto, @Headers('x-cart-token') guestToken?: string) {
    return this.ordersService.checkoutGuest(dto, guestToken);
  }
}
