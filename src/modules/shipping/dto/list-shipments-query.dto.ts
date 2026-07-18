import { Type } from 'class-transformer';
import { ShipmentStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListShipmentsQueryDto {
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

  @ApiProperty({ required: false, enum: ShipmentStatus })
  @IsOptional()
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus;
}
