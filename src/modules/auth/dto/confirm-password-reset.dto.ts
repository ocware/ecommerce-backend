import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ConfirmPasswordResetDto {
  @ApiProperty()
  @IsString()
  @MinLength(32)
  token!: string;

  @ApiProperty({ example: 'new-correct-horse-battery-staple' })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
