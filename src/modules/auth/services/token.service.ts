import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  ACCESS_TOKEN_TTL_SECONDS,
  sessionIdleExpiresAt,
} from '../../../common/session-ttl';
import { AccessTokenPayload } from '../types/token-payload';

type JwtHeader = {
  alg: 'HS256';
  typ: 'JWT';
};

@Injectable()
export class TokenService {
  readonly accessTokenTtlSeconds = ACCESS_TOKEN_TTL_SECONDS;

  constructor(private readonly configService: ConfigService) {}

  createAccessToken(payload: AccessTokenPayload): string {
    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      ...payload,
      iat: now,
      exp: now + this.accessTokenTtlSeconds,
    };
    const header: JwtHeader = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(jwtPayload));
    const signature = this.sign(`${encodedHeader}.${encodedPayload}`);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const [encodedHeader, encodedPayload, signature] = token.split('.');

    if (!encodedHeader || !encodedPayload || !signature) {
      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'The access token is invalid.',
      });
    }

    const expectedSignature = this.sign(`${encodedHeader}.${encodedPayload}`);
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'The access token is invalid.',
      });
    }

    const payload = JSON.parse(this.base64UrlDecode(encodedPayload)) as AccessTokenPayload & {
      exp?: number;
    };

    if (
      payload.type !== 'staff_access' ||
      !payload.exp ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) {
      throw new UnauthorizedException({
        code: 'EXPIRED_ACCESS_TOKEN',
        message: 'The access token is expired.',
      });
    }

    return payload;
  }

  createRefreshToken(): { token: string; tokenHash: string; expiresAt: Date } {
    const token = randomBytes(48).toString('base64url');
    const tokenHash = this.hashOpaqueToken(token);

    return {
      token,
      tokenHash,
      expiresAt: sessionIdleExpiresAt(),
    };
  }

  createPasswordResetToken(): { token: string; tokenHash: string; expiresAt: Date } {
    const token = randomBytes(48).toString('base64url');
    const tokenHash = this.hashOpaqueToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    return {
      token,
      tokenHash,
      expiresAt,
    };
  }

  hashOpaqueToken(token: string): string {
    return createHmac('sha256', this.getSecret()).update(token).digest('hex');
  }

  private sign(value: string): string {
    return createHmac('sha256', this.getSecret()).update(value).digest('base64url');
  }

  private getSecret(): string {
    return this.configService.getOrThrow<string>('app.jwtSecret');
  }

  private base64UrlEncode(value: string): string {
    return Buffer.from(value).toString('base64url');
  }

  private base64UrlDecode(value: string): string {
    return Buffer.from(value, 'base64url').toString('utf8');
  }
}
