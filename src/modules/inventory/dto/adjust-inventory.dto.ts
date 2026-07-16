import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, NotEquals } from 'class-validator';

export class AdjustInventoryDto {
  @ApiProperty({ description: 'Signed stock change.', example: 10 })
  @IsInt()
  @NotEquals(0)
  quantityDelta!: number;

  @ApiProperty({ example: 'Warehouse count correction' })
  @IsString()
  @MaxLength(500)
  reason!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}
