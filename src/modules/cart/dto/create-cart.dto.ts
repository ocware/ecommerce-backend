import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class CreateCartDto {
  @ApiPropertyOptional({ example: 'USD', description: 'Defaults to the shop currency.' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}
