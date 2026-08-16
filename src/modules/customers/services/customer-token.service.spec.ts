import { ConfigService } from '@nestjs/config';

import { CustomerTokenService } from './customer-token.service';

describe('CustomerTokenService', () => {
  const service = new CustomerTokenService({
    getOrThrow: () => 'test-secret-with-enough-length',
  } as unknown as ConfigService);

  it('creates and verifies customer access tokens', () => {
    const token = service.createAccessToken({
      sub: 'customer-id',
      email: 'customer@example.com',
      phone: null,
      name: 'Customer',
      sessionId: 'session-id',
      type: 'customer_access',
    });

    expect(service.verifyAccessToken(token)).toMatchObject({
      sub: 'customer-id',
      email: 'customer@example.com',
      sessionId: 'session-id',
      type: 'customer_access',
    });
  });

  it('creates hashable opaque refresh tokens with 7-day idle expiry', () => {
    const before = Date.now();
    const refreshToken = service.createRefreshToken();
    const after = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    expect(refreshToken.token.length).toBeGreaterThan(32);
    expect(refreshToken.tokenHash).toBe(service.hashOpaqueToken(refreshToken.token));
    expect(refreshToken.expiresAt.getTime()).toBeGreaterThanOrEqual(before + thirtyDays - 1000);
    expect(refreshToken.expiresAt.getTime()).toBeLessThanOrEqual(after + thirtyDays + 1000);
  });
});
