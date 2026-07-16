import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class LogoutCustomerDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(32)
  refreshToken?: string;
}
