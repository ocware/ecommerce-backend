export type CustomerRegistered = {
  name: 'CustomerRegistered';
  occurredAt: Date;
  customerId: string;
  email: string;
  phone: string | null;
  customerName: string;
};

export type CustomerDomainEvent = CustomerRegistered;
