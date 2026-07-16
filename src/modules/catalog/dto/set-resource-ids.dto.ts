import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SetResourceIdsDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];
}
