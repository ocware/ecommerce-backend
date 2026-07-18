import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class UpsertShippingRateDto {
  @ApiProperty({ example: '8.00' })
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})\.\d{2}$/)
  price!: string;

  @ApiProperty({ required: false, example: '100.00' })
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})\.\d{2}$/)
  freeShippingThreshold?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})\.\d{2}$/)
  minimumOrderAmount?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})\.\d{2}$/)
  maximumOrderAmount?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
