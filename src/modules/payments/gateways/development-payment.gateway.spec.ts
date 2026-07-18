import { createHmac } from 'node:crypto';

import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DevelopmentPaymentGateway } from './development-payment.gateway';

describe('DevelopmentPaymentGateway', () => {
  const secret = 'test-payment-secret-with-length';
  const gateway = new DevelopmentPaymentGateway({
    getOrThrow: jest.fn(() => secret),
  } as unknown as ConfigService);
  const payload = {
    eventId: 'event-1',
    gatewayReference: 'dev-reference',
    status: 'SUCCEEDED',
    transactionReference: 'transaction-1',
    amount: '40.00',
    currency: 'USD',
    signature: '',
  };

  beforeEach(() => {
    payload.signature = createHmac('sha256', secret)
      .update(
        [
          payload.eventId,
          payload.gatewayReference,
          payload.status,
          payload.transactionReference,
          payload.amount,
          payload.currency,
        ].join('|'),
      )
      .digest('hex');
  });

  it('verifies a signed gateway result against the expected amount and reference', async () => {
    const result = await gateway.verifyPayment({
      gatewayReference: payload.gatewayReference,
      amount: payload.amount,
      currency: payload.currency,
      payload,
      trusted: false,
    });

    expect(result).toMatchObject({
      state: 'SUCCEEDED',
      gatewayReference: payload.gatewayReference,
      transactionReference: payload.transactionReference,
      eventId: payload.eventId,
    });
  });

  it('rejects callbacks with invalid signatures', async () => {
    await expect(
      gateway.verifyPayment({
        gatewayReference: payload.gatewayReference,
        amount: payload.amount,
        currency: payload.currency,
        payload: { ...payload, signature: 'invalid' },
        trusted: false,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
