import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterCustomerDto {
  @ApiProperty({ example: 'customer@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Sara Customer' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: '+989121234567', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'correct-horse-battery-staple' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}
