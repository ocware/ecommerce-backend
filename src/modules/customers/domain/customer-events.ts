export type CustomerRegistered = {
  name: 'CustomerRegistered';
  occurredAt: Date;
  customerId: string;
  email: string | null;
  phone: string | null;
  customerName: string;
};

export type CustomerPasswordResetRequested = {
  name: 'CustomerPasswordResetRequested';
  occurredAt: Date;
  customerId: string;
  passwordResetTokenId: string;
  email: string;
  resetToken: string;
  expiresAt: Date;
};

export type CustomerDomainEvent = CustomerRegistered | CustomerPasswordResetRequested;
