export type InventoryLow = {
  name: 'InventoryLow';
  occurredAt: Date;
  eventId: string;
  inventoryItemId: string;
  variantId: string;
  availableStock: number;
  lowStockThreshold: number;
};

export type InventoryDomainEvent = InventoryLow;
