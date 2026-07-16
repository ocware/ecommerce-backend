import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateProductAttributeDto {
  @ApiProperty({ example: 'Color' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ required: false, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
