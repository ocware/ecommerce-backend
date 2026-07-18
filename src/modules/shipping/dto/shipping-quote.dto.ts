import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';

import { ShippingAddressDto } from './shipping-address.dto';

export class ShippingQuoteDto {
  @ApiProperty({ type: ShippingAddressDto })
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  address!: ShippingAddressDto;

  @ApiProperty({ example: '75.00' })
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})\.\d{2}$/)
  orderSubtotal!: string;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  freeShippingDiscount?: boolean;
}
