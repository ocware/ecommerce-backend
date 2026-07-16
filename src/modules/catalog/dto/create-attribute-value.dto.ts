import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateAttributeValueDto {
  @ApiProperty({ example: 'Black' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  value!: string;

  @ApiProperty({ required: false, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
