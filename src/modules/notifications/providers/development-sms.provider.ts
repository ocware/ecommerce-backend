import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { ProviderDeliveryResult } from '../contracts/email-provider';
import { SendSmsInput, SmsProvider } from '../contracts/sms-provider';

@Injectable()
export class DevelopmentSmsProvider implements SmsProvider {
  readonly name = 'development-sms';

  send(input: SendSmsInput): Promise<ProviderDeliveryResult> {
    void input;
    return Promise.resolve({ messageId: `dev-sms-${randomUUID()}` });
  }
}
