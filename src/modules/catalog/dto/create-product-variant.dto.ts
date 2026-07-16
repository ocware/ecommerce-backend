import { ProductVariantStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductVariantDto {
  @ApiProperty({ example: 'Black / Medium' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'TSHIRT-BLK-M' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sku!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @ApiProperty({ enum: ProductVariantStatus, required: false })
  @IsOptional()
  @IsEnum(ProductVariantStatus)
  status?: ProductVariantStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiProperty({ required: false, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
