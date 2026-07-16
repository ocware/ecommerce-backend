import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentCustomer } from '../decorators/current-customer.decorator';
import { CreateCustomerAddressDto } from '../dto/create-customer-address.dto';
import { CreateGuestCheckoutProfileDto } from '../dto/create-guest-checkout-profile.dto';
import { LoginCustomerDto } from '../dto/login-customer.dto';
import { LogoutCustomerDto } from '../dto/logout-customer.dto';
import { RefreshCustomerTokenDto } from '../dto/refresh-customer-token.dto';
import { RegisterCustomerDto } from '../dto/register-customer.dto';
import { UpdateCustomerProfileDto } from '../dto/update-customer-profile.dto';
import { CustomerAuthGuard } from '../guards/customer-auth.guard';
import { CustomersService } from '../services/customers.service';
import { AuthenticatedCustomer } from '../types/authenticated-customer';

@ApiTags('store customers')
@Controller({
  path: 'store/customers',
  version: '1',
})
export class StoreCustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post('register')
  register(@Body() dto: RegisterCustomerDto) {
    return this.customersService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginCustomerDto) {
    return this.customersService.login(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshCustomerTokenDto) {
    return this.customersService.refresh(dto);
  }

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(CustomerAuthGuard)
  logout(@Body() dto: LogoutCustomerDto, @CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.customersService.logout(dto, customer);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(CustomerAuthGuard)
  getProfile(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.customersService.getProfile(customer);
  }

  @Patch('me')
  @ApiBearerAuth()
  @UseGuards(CustomerAuthGuard)
  updateProfile(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: UpdateCustomerProfileDto,
  ) {
    return this.customersService.updateProfile(customer, dto);
  }

  @Get('me/addresses')
  @ApiBearerAuth()
  @UseGuards(CustomerAuthGuard)
  listAddresses(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.customersService.listAddresses(customer);
  }

  @Post('me/addresses')
  @ApiBearerAuth()
  @UseGuards(CustomerAuthGuard)
  createAddress(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: CreateCustomerAddressDto,
  ) {
    return this.customersService.createAddress(customer, dto);
  }

  @Get('me/orders')
  @ApiBearerAuth()
  @UseGuards(CustomerAuthGuard)
  listOrderHistory() {
    return this.customersService.listOrderHistory();
  }

  @Post('guest-checkout-profile')
  createGuestCheckoutProfile(@Body() dto: CreateGuestCheckoutProfileDto) {
    return this.customersService.createGuestCheckoutProfile(dto);
  }
}
