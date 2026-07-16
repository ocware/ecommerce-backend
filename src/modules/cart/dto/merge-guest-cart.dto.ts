import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class MergeGuestCartDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  guestCartId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(32)
  guestToken!: string;
}
