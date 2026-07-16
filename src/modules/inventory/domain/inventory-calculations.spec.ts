import { calculateAvailableStock, isLowStock, isValidStockState } from './inventory-calculations';

describe('inventory calculations', () => {
  it('calculates available stock from current and reserved stock', () => {
    expect(calculateAvailableStock({ currentStock: 10, reservedStock: 3 })).toBe(7);
  });

  it('treats stock at or below its threshold as low stock', () => {
    expect(isLowStock({ currentStock: 5, reservedStock: 3, lowStockThreshold: 2 })).toBe(true);
    expect(isLowStock({ currentStock: 5, reservedStock: 2, lowStockThreshold: 2 })).toBe(false);
  });

  it('rejects negative stock and reservations above current stock', () => {
    expect(isValidStockState({ currentStock: -1, reservedStock: 0 })).toBe(false);
    expect(isValidStockState({ currentStock: 2, reservedStock: 3 })).toBe(false);
    expect(isValidStockState({ currentStock: 2, reservedStock: 2 })).toBe(true);
  });
});
