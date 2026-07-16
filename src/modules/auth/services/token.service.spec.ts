import { ConfigService } from '@nestjs/config';

import { StaffRole } from '../types/staff-role';
import { TokenService } from './token.service';

describe('TokenService', () => {
  const service = new TokenService({
    getOrThrow: () => 'test-secret-with-enough-length',
  } as unknown as ConfigService);

  it('creates and verifies staff access tokens', () => {
    const token = service.createAccessToken({
      sub: 'staff-id',
      email: 'owner@example.com',
      name: 'Owner',
      role: StaffRole.OWNER,
      sessionId: 'session-id',
      type: 'staff_access',
    });

    expect(service.verifyAccessToken(token)).toMatchObject({
      sub: 'staff-id',
      role: StaffRole.OWNER,
      sessionId: 'session-id',
    });
  });

  it('creates hashable opaque refresh tokens', () => {
    const refreshToken = service.createRefreshToken();

    expect(refreshToken.token.length).toBeGreaterThan(32);
    expect(refreshToken.tokenHash).toBe(service.hashOpaqueToken(refreshToken.token));
    expect(refreshToken.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
