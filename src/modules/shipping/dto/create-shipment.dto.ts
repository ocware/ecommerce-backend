import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class CreateShipmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  orderId!: string;

  @ApiProperty({ format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  shippingMethodId?: string;
}
