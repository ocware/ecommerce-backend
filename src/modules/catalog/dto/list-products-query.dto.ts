import { ProductStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export enum ProductSort {
  Newest = 'newest',
  NameAsc = 'name_asc',
  NameDesc = 'name_desc',
  PriceAsc = 'price_asc',
  PriceDesc = 'price_desc',
  Bestselling = 'bestseller',
  Popular = 'popular',
}

export class ListProductsQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  collection?: string;

  @ApiProperty({
    required: false,
    type: [String],
    format: 'uuid',
    description:
      'Comma-separated or repeated product UUIDs. When set, results are filtered to these IDs and returned in the requested order.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === '') return undefined;
    const raw = Array.isArray(value) ? value : String(value).split(',');
    return raw
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  })
  @IsArray()
  @ArrayMaxSize(24)
  @IsUUID(undefined, { each: true })
  ids?: string[];

  @ApiProperty({ required: false, example: 'USD' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @ApiProperty({ enum: ProductStatus, required: false })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiProperty({ required: false, description: 'Minimum fixed variant price in minor currency units.' })
  @IsOptional()
  @IsNumberString()
  minPrice?: string;

  @ApiProperty({ required: false, description: 'Maximum fixed variant price in minor currency units.' })
  @IsOptional()
  @IsNumberString()
  maxPrice?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  inStock?: boolean;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiProperty({ required: false, default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiProperty({ enum: ProductSort, required: false, default: ProductSort.Newest })
  @IsOptional()
  @IsEnum(ProductSort)
  sort: ProductSort = ProductSort.Newest;
}
