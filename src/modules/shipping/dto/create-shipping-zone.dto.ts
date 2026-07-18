import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateShippingZoneDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ type: [String], example: ['US'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  countries!: string[];

  @ApiProperty({ type: [String], required: false, example: ['CA'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  provinces?: string[];

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
