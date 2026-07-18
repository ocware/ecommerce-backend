import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { EmailProvider, ProviderDeliveryResult, SendEmailInput } from '../contracts/email-provider';

@Injectable()
export class DevelopmentEmailProvider implements EmailProvider {
  readonly name = 'development-email';

  send(input: SendEmailInput): Promise<ProviderDeliveryResult> {
    void input;
    return Promise.resolve({ messageId: `dev-email-${randomUUID()}` });
  }
}
