import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { extractAccessToken } from '../../../common/auth/access-token';
import { AuthService } from '../services/auth.service';
import { AuthenticatedStaff } from '../types/authenticated-staff';
import { TokenService } from '../services/token.service';

type StaffRequest = {
  headers: {
    authorization?: string;
    cookie?: string;
  };
  staff?: AuthenticatedStaff;
};

@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<StaffRequest>();
    const token = extractAccessToken(
      request.headers,
      this.configService.get<string>('app.sessionCookieName') ?? 'session',
    );
    if (!token) {
      throw new UnauthorizedException({
        code: 'MISSING_ACCESS_TOKEN',
        message: 'A bearer access token or session cookie is required.',
      });
    }
    const payload = this.tokenService.verifyAccessToken(token);
    request.staff = await this.authService.getSessionStaff(payload.sub, payload.sessionId);

    return true;
  }
}
