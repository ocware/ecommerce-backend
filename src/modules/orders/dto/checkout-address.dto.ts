import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CheckoutAddressDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  phone!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  country!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  province!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  line1!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  line2?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  postalCode?: string;
}
