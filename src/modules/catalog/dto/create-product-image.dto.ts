import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateProductImageDto {
  @ApiProperty()
  @IsString()
  url!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  altText?: string;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiProperty({ required: false, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
