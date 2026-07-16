import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import { AuthService } from '../services/auth.service';
import { AuthenticatedStaff } from '../types/authenticated-staff';
import { TokenService } from '../services/token.service';

type StaffRequest = {
  headers: {
    authorization?: string;
  };
  staff?: AuthenticatedStaff;
};

@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<StaffRequest>();
    const token = this.extractBearerToken(request.headers.authorization);
    const payload = this.tokenService.verifyAccessToken(token);
    request.staff = await this.authService.getSessionStaff(payload.sub, payload.sessionId);

    return true;
  }

  private extractBearerToken(authorization?: string): string {
    const [type, token] = authorization?.split(' ') ?? [];

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException({
        code: 'MISSING_ACCESS_TOKEN',
        message: 'A bearer access token is required.',
      });
    }

    return token;
  }
}
