import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import { CustomersService } from '../services/customers.service';
import { CustomerTokenService } from '../services/customer-token.service';
import { AuthenticatedCustomer } from '../types/authenticated-customer';

type CustomerRequest = {
  headers: {
    authorization?: string;
  };
  customer?: AuthenticatedCustomer;
};

@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: CustomerTokenService,
    private readonly customersService: CustomersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CustomerRequest>();
    const token = this.extractBearerToken(request.headers.authorization);
    const payload = this.tokenService.verifyAccessToken(token);
    request.customer = await this.customersService.getSessionCustomer(
      payload.sub,
      payload.sessionId,
    );

    return true;
  }

  private extractBearerToken(authorization?: string): string {
    const [type, token] = authorization?.split(' ') ?? [];

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException({
        code: 'MISSING_CUSTOMER_ACCESS_TOKEN',
        message: 'A bearer customer access token is required.',
      });
    }

    return token;
  }
}
