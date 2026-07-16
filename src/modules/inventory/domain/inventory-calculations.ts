export type InventoryStockState = {
  currentStock: number;
  reservedStock: number;
  lowStockThreshold: number;
};

export function calculateAvailableStock(
  state: Pick<InventoryStockState, 'currentStock' | 'reservedStock'>,
) {
  return state.currentStock - state.reservedStock;
}

export function isLowStock(state: InventoryStockState): boolean {
  return calculateAvailableStock(state) <= state.lowStockThreshold;
}

export function isValidStockState(
  state: Pick<InventoryStockState, 'currentStock' | 'reservedStock'>,
): boolean {
  return (
    state.currentStock >= 0 && state.reservedStock >= 0 && state.reservedStock <= state.currentStock
  );
}
