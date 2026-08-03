import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CompleteCustomerOtpRegistrationDto {
  @ApiProperty()
  @IsString()
  @MinLength(32)
  registrationToken!: string;

  @ApiProperty({ example: 'سارا محمدی' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'customer@example.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}
