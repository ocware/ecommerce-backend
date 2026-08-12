import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { extractAccessToken } from '../../../common/auth/access-token';
import { CustomersService } from '../services/customers.service';
import { CustomerTokenService } from '../services/customer-token.service';
import { AuthenticatedCustomer } from '../types/authenticated-customer';

type CustomerRequest = {
  headers: {
    authorization?: string;
    cookie?: string;
  };
  customer?: AuthenticatedCustomer;
};

@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: CustomerTokenService,
    private readonly customersService: CustomersService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CustomerRequest>();
    const token = extractAccessToken(
      request.headers,
      this.configService.get<string>('app.sessionCookieName') ?? 'session',
    );
    if (!token) {
      throw new UnauthorizedException({
        code: 'MISSING_CUSTOMER_ACCESS_TOKEN',
        message: 'A bearer customer access token or session cookie is required.',
      });
    }
    const payload = this.tokenService.verifyAccessToken(token);
    request.customer = await this.customersService.getSessionCustomer(
      payload.sub,
      payload.sessionId,
    );

    return true;
  }
}
