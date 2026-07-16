import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateGuestCheckoutProfileDto {
  @ApiProperty({ example: 'guest@example.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: '+989121234567', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'Guest Customer' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
