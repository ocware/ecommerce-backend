import { ReturnRequestStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const reviewStatuses = [
  ReturnRequestStatus.APPROVED,
  ReturnRequestStatus.REJECTED,
  ReturnRequestStatus.RECEIVED,
  ReturnRequestStatus.CLOSED,
] as const;

export class ReviewReturnRequestDto {
  @ApiProperty({ enum: reviewStatuses })
  @IsIn(reviewStatuses)
  status!: (typeof reviewStatuses)[number];

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  adminNote?: string;
}
