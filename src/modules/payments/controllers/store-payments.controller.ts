import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';

import { CurrentCustomer } from '../../customers/decorators/current-customer.decorator';
import { CustomerAuthGuard } from '../../customers/guards/customer-auth.guard';
import { AuthenticatedCustomer } from '../../customers/types/authenticated-customer';
import { StartPaymentDto } from '../dto/start-payment.dto';
import { VerifyPaymentDto } from '../dto/verify-payment.dto';
import { PaymentsService } from '../services/payments.service';

@ApiTags('store payments')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller({ path: 'store/payments', version: '1' })
export class StorePaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('orders/:orderId/attempts')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  startPayment(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: StartPaymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.paymentsService.startCustomerPayment(orderId, dto, idempotencyKey, customer);
  }

  @Get('attempts/:id')
  getAttempt(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.paymentsService.getCustomerAttempt(id, customer);
  }

  @Post('attempts/:id/verification')
  verifyAttempt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyPaymentDto,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ) {
    return this.paymentsService.verifyCustomerAttempt(id, dto, customer);
  }
}
