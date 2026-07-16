import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginCustomerDto {
  @ApiProperty({ example: 'customer@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'correct-horse-battery-staple' })
  @IsString()
  @MinLength(8)
  password!: string;
}
