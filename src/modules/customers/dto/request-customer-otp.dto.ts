import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class RequestCustomerOtpDto {
  @ApiProperty({ example: '09121234567' })
  @IsString()
  @Matches(/^(?:\+98|0098|98|0)?9\d{9}$/)
  phone!: string;
}
