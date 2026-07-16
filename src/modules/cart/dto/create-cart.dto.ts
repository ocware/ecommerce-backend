import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class CreateCartDto {
  @ApiProperty({ example: 'USD' })
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}
