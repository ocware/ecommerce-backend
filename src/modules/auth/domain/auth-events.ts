export type PasswordResetRequested = {
  name: 'PasswordResetRequested';
  occurredAt: Date;
  passwordResetTokenId: string;
  staffUserId: string;
  email: string;
  resetToken: string;
  expiresAt: Date;
};

export type AuthDomainEvent = PasswordResetRequested;
