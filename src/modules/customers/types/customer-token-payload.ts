export type CustomerAccessTokenPayload = {
  sub: string;
  email?: string | null;
  phone?: string | null;
  name: string;
  sessionId: string;
  type: 'customer_access';
};
