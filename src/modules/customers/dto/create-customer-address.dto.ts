import { AddressType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCustomerAddressDto {
  @ApiProperty({ enum: AddressType, example: AddressType.SHIPPING })
  @IsEnum(AddressType)
  type!: AddressType;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty()
  @IsString()
  phone!: string;

  @ApiProperty()
  @IsString()
  country!: string;

  @ApiProperty()
  @IsString()
  province!: string;

  @ApiProperty()
  @IsString()
  city!: string;

  @ApiProperty()
  @IsString()
  line1!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  line2?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
