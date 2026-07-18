import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

import { CheckoutAddressDto } from './checkout-address.dto';
import { CheckoutCustomerDto } from './checkout-customer.dto';
import { InvoiceInformationDto } from './invoice-information.dto';

export class CheckoutDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  cartId!: string;

  @ApiProperty({ type: CheckoutCustomerDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutCustomerDto)
  customer?: CheckoutCustomerDto;

  @ApiProperty({ type: CheckoutAddressDto })
  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  billingAddress!: CheckoutAddressDto;

  @ApiProperty({ type: CheckoutAddressDto })
  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  shippingAddress!: CheckoutAddressDto;

  @ApiProperty({ type: InvoiceInformationDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => InvoiceInformationDto)
  invoiceInformation?: InvoiceInformationDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerNote?: string;
}
