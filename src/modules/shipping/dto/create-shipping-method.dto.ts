import { ShippingMethodType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { ShippingProviderName } from '../contracts/shipping-provider';

export class CreateShippingMethodDto {
  @ApiProperty({ example: 'standard-delivery' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(100)
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ enum: ShippingProviderName, default: ShippingProviderName.LOCAL })
  @IsEnum(ShippingProviderName)
  provider!: ShippingProviderName;

  @ApiProperty({ enum: ShippingMethodType })
  @IsEnum(ShippingMethodType)
  type!: ShippingMethodType;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @ApiProperty({ example: '5.00' })
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})\.\d{2}$/)
  defaultPrice!: string;

  @ApiProperty({ required: false, example: '100.00' })
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})\.\d{2}$/)
  freeShippingThreshold?: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  estimatedMinDays!: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  estimatedMaxDays!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  pickupInstructions?: string;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject()
  pickupAddress?: Record<string, unknown>;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
