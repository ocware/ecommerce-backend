import { ProviderDeliveryResult } from './email-provider';

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export type SendSmsInput = {
  to: string;
  message: string;
};

export interface SmsProvider {
  readonly name: string;
  send(input: SendSmsInput): Promise<ProviderDeliveryResult>;
}
