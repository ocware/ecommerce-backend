export type OrderCreated = {
  name: 'OrderCreated';
  occurredAt: Date;
  orderId: string;
  orderNumber: string;
  customerId: string | null;
  total: string;
  currency: string;
};

export type OrderCancelled = {
  name: 'OrderCancelled';
  occurredAt: Date;
  orderId: string;
  orderNumber: string;
  customerId: string | null;
  reason: string;
};

export type OrderDomainEvent = OrderCreated | OrderCancelled;
