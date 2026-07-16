import { ProductStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export enum ProductSort {
  Newest = 'newest',
  NameAsc = 'name_asc',
  NameDesc = 'name_desc',
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

  @ApiProperty({ required: false, example: 'USD' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @ApiProperty({ enum: ProductStatus, required: false })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

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
