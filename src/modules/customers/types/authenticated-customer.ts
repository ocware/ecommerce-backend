export type AuthenticatedCustomer = {
  id: string;
  email?: string | null;
  phone?: string | null;
  name: string;
  sessionId: string;
};
