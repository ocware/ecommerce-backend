import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class LogoutDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(32)
  refreshToken?: string;
}
