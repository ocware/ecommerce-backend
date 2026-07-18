import { ShipmentStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateShipmentStatusDto {
  @ApiProperty({ enum: ShipmentStatus })
  @IsEnum(ShipmentStatus)
  status!: ShipmentStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ required: false, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  estimatedDeliveryAt?: string;
}
