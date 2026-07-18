import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';

import { StartPaymentDto } from '../dto/start-payment.dto';
import { VerifyPaymentDto } from '../dto/verify-payment.dto';
import { PaymentsService } from '../services/payments.service';

@ApiTags('store guest payments')
@ApiHeader({ name: 'x-cart-token', required: true })
@Controller({ path: 'store/payments/guest', version: '1' })
export class StoreGuestPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('orders/:orderId/attempts')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  startPayment(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: StartPaymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-cart-token') guestToken: string | undefined,
  ) {
    return this.paymentsService.startGuestPayment(orderId, dto, idempotencyKey, guestToken);
  }

  @Get('attempts/:id')
  getAttempt(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-cart-token') guestToken: string | undefined,
  ) {
    return this.paymentsService.getGuestAttempt(id, guestToken);
  }

  @Post('attempts/:id/verification')
  verifyAttempt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyPaymentDto,
    @Headers('x-cart-token') guestToken: string | undefined,
  ) {
    return this.paymentsService.verifyGuestAttempt(id, dto, guestToken);
  }
}
