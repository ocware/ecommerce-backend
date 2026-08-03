import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { SendSmsInput, SmsDeliveryResult, SmsProvider } from './sms-provider';

@Injectable()
export class DevelopmentSmsProvider implements SmsProvider {
  readonly name = 'development-sms';

  send(input: SendSmsInput): Promise<SmsDeliveryResult> {
    void input;
    return Promise.resolve({ messageId: `dev-sms-${randomUUID()}` });
  }
}
