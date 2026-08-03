import { CmsPageStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpsertContentPageDto {
  @ApiProperty({ minLength: 1, maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @ApiProperty({ minLength: 1, maxLength: 100000 })
  @IsString()
  @MinLength(1)
  @MaxLength(100000)
  bodyMarkdown!: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  seoTitle?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  seoDescription?: string;

  @ApiProperty({ enum: CmsPageStatus })
  @IsEnum(CmsPageStatus)
  status!: CmsPageStatus;
}
