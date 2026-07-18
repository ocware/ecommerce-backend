import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class InitializeInventoryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  variantId!: string;

  @ApiProperty({ minimum: 0, default: 0 })
  @IsInt()
  @Min(0)
  currentStock!: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Defaults to the shop setting.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;
}
