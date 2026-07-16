import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal, IsOptional, Matches } from 'class-validator';

export class UpsertProductPriceDto {
  @ApiProperty({ example: 'USD' })
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @ApiProperty({ example: '19.99' })
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  amount!: string;

  @ApiProperty({ example: '24.99', required: false })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  compareAtAmount?: string;
}
