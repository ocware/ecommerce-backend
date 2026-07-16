import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class CreateStockReservationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  variantId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ example: 'checkout_01J...' })
  @IsString()
  @MinLength(4)
  @MaxLength(200)
  externalReference!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  expiresAt!: string;
}
