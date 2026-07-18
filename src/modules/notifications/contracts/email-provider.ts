export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type ProviderDeliveryResult = { messageId: string };

export interface EmailProvider {
  readonly name: string;
  send(input: SendEmailInput): Promise<ProviderDeliveryResult>;
}
