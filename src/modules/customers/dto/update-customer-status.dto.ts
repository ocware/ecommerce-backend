import { CustomerStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class UpdateCustomerStatusDto {
  @ApiProperty({ enum: CustomerStatus, example: CustomerStatus.ACTIVE })
  @IsEnum(CustomerStatus)
  status!: CustomerStatus;
}
