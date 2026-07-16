import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class InitializeInventoryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  variantId!: string;

  @ApiProperty({ minimum: 0, default: 0 })
  @IsInt()
  @Min(0)
  currentStock!: number;

  @ApiProperty({ minimum: 0, default: 0 })
  @IsInt()
  @Min(0)
  lowStockThreshold!: number;
}
