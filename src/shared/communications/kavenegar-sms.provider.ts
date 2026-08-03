import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SendSmsInput, SmsDeliveryResult, SmsProvider } from './sms-provider';

type KavenegarResponse = {
  return?: { status?: number; message?: string };
  entries?: Array<{ messageid?: number | string }>;
};

@Injectable()
export class KavenegarSmsProvider implements SmsProvider {
  readonly name = 'kavenegar';

  constructor(private readonly config: ConfigService) {}

  async send(input: SendSmsInput): Promise<SmsDeliveryResult> {
    const apiKey = this.config.getOrThrow<string>('app.kavenegarApiKey');
    const sender = this.config.get<string>('app.kavenegarSender');
    const body = new URLSearchParams({
      receptor: input.to,
      message: input.message,
      ...(sender ? { sender } : {}),
    });
    const response = await fetch(
      `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/sms/send.json`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: AbortSignal.timeout(10_000),
      },
    );
    const result = (await response.json().catch(() => ({}))) as KavenegarResponse;
    const status = result.return?.status;
    const messageId = result.entries?.[0]?.messageid;
    if (!response.ok || status !== 200 || messageId === undefined) {
      throw new Error(
        `Kavenegar rejected the SMS (${status ?? response.status}): ${
          result.return?.message ?? 'unknown provider error'
        }`,
      );
    }
    return { messageId: String(messageId) };
  }
}
