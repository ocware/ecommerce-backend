import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { CustomerAccessTokenPayload } from '../types/customer-token-payload';

@Injectable()
export class CustomerTokenService {
  private readonly accessTokenTtlSeconds = 15 * 60;
  private readonly refreshTokenTtlDays = 30;

  constructor(private readonly configService: ConfigService) {}

  createAccessToken(payload: CustomerAccessTokenPayload): string {
    const now = Math.floor(Date.now() / 1000);
    const encodedHeader = this.base64UrlEncode(
      JSON.stringify({
        alg: 'HS256',
        typ: 'JWT',
      }),
    );
    const encodedPayload = this.base64UrlEncode(
      JSON.stringify({
        ...payload,
        iat: now,
        exp: now + this.accessTokenTtlSeconds,
      }),
    );
    const signature = this.sign(`${encodedHeader}.${encodedPayload}`);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  verifyAccessToken(token: string): CustomerAccessTokenPayload {
    const [encodedHeader, encodedPayload, signature] = token.split('.');

    if (!encodedHeader || !encodedPayload || !signature) {
      throw new UnauthorizedException({
        code: 'INVALID_CUSTOMER_ACCESS_TOKEN',
        message: 'The customer access token is invalid.',
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
        code: 'INVALID_CUSTOMER_ACCESS_TOKEN',
        message: 'The customer access token is invalid.',
      });
    }

    const payload = JSON.parse(
      this.base64UrlDecode(encodedPayload),
    ) as CustomerAccessTokenPayload & {
      exp?: number;
    };

    if (
      payload.type !== 'customer_access' ||
      !payload.exp ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) {
      throw new UnauthorizedException({
        code: 'EXPIRED_CUSTOMER_ACCESS_TOKEN',
        message: 'The customer access token is expired.',
      });
    }

    return payload;
  }

  createRefreshToken(): { token: string; tokenHash: string; expiresAt: Date } {
    const token = randomBytes(48).toString('base64url');
    const tokenHash = this.hashOpaqueToken(token);
    const expiresAt = new Date(Date.now() + this.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

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
