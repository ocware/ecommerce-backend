import { ProductReviewStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class ModerateReviewDto {
  @ApiProperty({ enum: [ProductReviewStatus.APPROVED, ProductReviewStatus.REJECTED] })
  @IsIn([ProductReviewStatus.APPROVED, ProductReviewStatus.REJECTED])
  status!: 'APPROVED' | 'REJECTED';
}
