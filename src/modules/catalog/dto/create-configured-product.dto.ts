import { ProductStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class ConfiguredImageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  url!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  altText?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

class ConfiguredVariantDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sku!: string;

  @ApiProperty({ example: '1250000' })
  @Matches(/^(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/)
  price!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/)
  compareAtPrice?: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  stock!: number;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  @IsObject()
  attributes!: Record<string, string>;

  @ApiPropertyOptional({ type: ConfiguredImageDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ConfiguredImageDto)
  image?: ConfiguredImageDto;
}

export class CreateConfiguredProductDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  name!: string;

  @ApiProperty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;

  @ApiProperty({ enum: ProductStatus })
  @IsEnum(ProductStatus)
  status!: ProductStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ type: [ConfiguredVariantDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ConfiguredVariantDto)
  variants!: ConfiguredVariantDto[];

  @ApiPropertyOptional({ type: [ConfiguredImageDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ConfiguredImageDto)
  images?: ConfiguredImageDto[];
}
