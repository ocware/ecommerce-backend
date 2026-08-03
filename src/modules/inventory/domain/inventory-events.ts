export type InventoryLow = {
  name: 'InventoryLow';
  occurredAt: Date;
  eventId: string;
  inventoryItemId: string;
  variantId: string;
  availableStock: number;
  lowStockThreshold: number;
};

export type InventoryRestocked = {
  name: 'InventoryRestocked';
  occurredAt: Date;
  eventId: string;
  inventoryItemId: string;
  variantId: string;
  availableStock: number;
};

export type InventoryDomainEvent = InventoryLow | InventoryRestocked;
