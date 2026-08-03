import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class RequestCustomerPasswordResetDto {
  @ApiProperty({ example: 'customer@example.com' })
  @IsEmail()
  email!: string;
}
