import { ProductStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Classic T-Shirt' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'classic-t-shirt' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string;

  @ApiProperty({ enum: ProductStatus, required: false })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  seoTitle?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  seoDescription?: string;
}
