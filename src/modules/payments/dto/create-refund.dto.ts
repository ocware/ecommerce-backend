import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateRefundDto {
  @ApiProperty({ example: '25.00' })
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})\.\d{2}$/)
  amount!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason?: string;
}
