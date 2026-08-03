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

import { CurrentCustomer } from '../decorators/current-customer.decorator';
import { CreateCustomerAddressDto } from '../dto/create-customer-address.dto';
import { ConfirmCustomerPasswordResetDto } from '../dto/confirm-customer-password-reset.dto';
import { CompleteCustomerOtpRegistrationDto } from '../dto/complete-customer-otp-registration.dto';
import { CreateGuestCheckoutProfileDto } from '../dto/create-guest-checkout-profile.dto';
import { LoginCustomerDto } from '../dto/login-customer.dto';
import { LogoutCustomerDto } from '../dto/logout-customer.dto';
import { RefreshCustomerTokenDto } from '../dto/refresh-customer-token.dto';
import { RequestCustomerOtpDto } from '../dto/request-customer-otp.dto';
import { RequestCustomerPasswordResetDto } from '../dto/request-customer-password-reset.dto';
import { RegisterCustomerDto } from '../dto/register-customer.dto';
import { UpdateCustomerProfileDto } from '../dto/update-customer-profile.dto';
import { UpdateCustomerAddressDto } from '../dto/update-customer-address.dto';
import { VerifyCustomerOtpDto } from '../dto/verify-customer-otp.dto';
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

  @Post('password-reset/request')
  requestPasswordReset(@Body() dto: RequestCustomerPasswordResetDto) {
    return this.customersService.requestPasswordReset(dto);
  }

  @Post('password-reset/confirm')
  confirmPasswordReset(@Body() dto: ConfirmCustomerPasswordResetDto) {
    return this.customersService.confirmPasswordReset(dto);
  }

  @Post('otp/request')
  requestOtp(@Body() dto: RequestCustomerOtpDto) {
    return this.customersService.requestOtp(dto);
  }

  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyCustomerOtpDto) {
    return this.customersService.verifyOtp(dto);
  }

  @Post('otp/register')
  completeOtpRegistration(@Body() dto: CompleteCustomerOtpRegistrationDto) {
    return this.customersService.completeOtpRegistration(dto);
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

  @Patch('me/addresses/:id')
  @ApiBearerAuth()
  @UseGuards(CustomerAuthGuard)
  updateAddress(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerAddressDto,
  ) {
    return this.customersService.updateAddress(customer, id, dto);
  }

  @Delete('me/addresses/:id')
  @ApiBearerAuth()
  @UseGuards(CustomerAuthGuard)
  deleteAddress(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customersService.deleteAddress(customer, id);
  }

  @Post('guest-checkout-profile')
  createGuestCheckoutProfile(@Body() dto: CreateGuestCheckoutProfileDto) {
    return this.customersService.createGuestCheckoutProfile(dto);
  }
}
