import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class CurrencyQueryDto {
  @ApiProperty({ required: false, example: 'USD' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}
