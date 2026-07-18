export type ShipmentCreated = {
  name: 'ShipmentCreated';
  occurredAt: Date;
  shipmentId: string;
  orderId: string;
  provider: string;
  trackingCode: string | null;
};

export type ShipmentDelivered = {
  name: 'ShipmentDelivered';
  occurredAt: Date;
  shipmentId: string;
  orderId: string;
  trackingCode: string | null;
};

export type ShipmentDomainEvent = ShipmentCreated | ShipmentDelivered;
