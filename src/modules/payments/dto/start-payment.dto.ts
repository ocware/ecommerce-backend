import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUrl } from 'class-validator';

import { PaymentGatewayName } from '../contracts/payment-gateway';

export class StartPaymentDto {
  @ApiProperty({ enum: PaymentGatewayName })
  @IsEnum(PaymentGatewayName)
  gateway!: PaymentGatewayName;

  @ApiProperty({
    required: false,
    description: 'Frontend return URL; never used as proof of payment.',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  callbackUrl?: string;
}
