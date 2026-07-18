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

import { CurrentCustomer } from '../../customers/decorators/current-customer.decorator';
import { CustomerAuthGuard } from '../../customers/guards/customer-auth.guard';
import { AuthenticatedCustomer } from '../../customers/types/authenticated-customer';
import { ShippingQuoteDto } from '../dto/shipping-quote.dto';
import { ShippingRatesService } from '../services/shipping-rates.service';
import { ShippingService } from '../services/shipping.service';

@ApiTags('store shipping')
@Controller({ path: 'store/shipping', version: '1' })
export class StoreShippingController {
  constructor(
    private readonly shippingRatesService: ShippingRatesService,
    private readonly shippingService: ShippingService,
  ) {}

  @Post('rates')
  getRates(@Body() dto: ShippingQuoteDto) {
    return this.shippingRatesService.getAvailableRates(dto);
  }

  @Get('orders/:orderId/shipments')
  @ApiBearerAuth()
  @UseGuards(CustomerAuthGuard)
  listCustomerShipments(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.shippingService.listCustomerOrderShipments(orderId, customer);
  }

  @Get('guest/orders/:orderId/shipments')
  @ApiHeader({ name: 'x-cart-token', required: true })
  listGuestShipments(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Headers('x-cart-token') guestToken?: string,
  ) {
    return this.shippingService.listGuestOrderShipments(orderId, guestToken);
  }
}
