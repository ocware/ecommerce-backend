import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

import { StaffRole } from '../types/staff-role';

export class CreateStaffUserDto {
  @ApiProperty({ example: 'manager@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Product Manager' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ enum: StaffRole, example: StaffRole.PRODUCT_MANAGER })
  @IsEnum(StaffRole)
  role!: StaffRole;

  @ApiProperty({ example: 'temporary-strong-password' })
  @IsString()
  @MinLength(8)
  password!: string;
}
