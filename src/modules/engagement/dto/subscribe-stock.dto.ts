import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SubscribeStockDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  variantId!: string;
}
