import { ConsentSource } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class RecordConsentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  anonymousId!: string;

  @ApiProperty()
  @IsBoolean()
  analyticsGranted!: boolean;

  @ApiProperty()
  @IsBoolean()
  marketingGranted!: boolean;

  @ApiProperty({ example: '2026-07' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  policyVersion!: string;

  @ApiPropertyOptional({ enum: ConsentSource, default: ConsentSource.COOKIE_BANNER })
  @IsOptional()
  @IsEnum(ConsentSource)
  source?: ConsentSource;
}
