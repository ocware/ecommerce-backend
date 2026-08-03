import { AnalyticsEventName } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsObject,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class AnalyticsEventDto {
  @ApiProperty({ enum: AnalyticsEventName })
  @IsEnum(AnalyticsEventName)
  name!: AnalyticsEventName;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  dedupeKey!: string;

  @ApiProperty()
  @IsDateString()
  occurredAt!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  payload!: Record<string, unknown>;
}

export class IngestAnalyticsEventsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  anonymousId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sessionId!: string;

  @ApiProperty({ type: [AnalyticsEventDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => AnalyticsEventDto)
  events!: AnalyticsEventDto[];
}
