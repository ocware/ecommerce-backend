import { InventoryMovementType, InventoryReservationStatus } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CatalogService } from '../../catalog/services/catalog.service';
import { InventoryService } from './inventory.service';

describe('InventoryService reservation lifecycle', () => {
  it('converts reserved stock into a completed deduction', async () => {
    const now = new Date();
    const item = {
      id: 'inventory-id',
      variantId: '11111111-1111-4111-8111-111111111111',
      currentStock: 10,
      reservedStock: 2,
      lowStockThreshold: 1,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    const reservation = {
      id: '22222222-2222-4222-8222-222222222222',
      inventoryItemId: item.id,
      externalReference: 'checkout-123',
      quantity: 2,
      status: InventoryReservationStatus.ACTIVE as InventoryReservationStatus,
      expiresAt: new Date(Date.now() + 60_000),
      confirmedAt: null as Date | null,
      releasedAt: null,
      createdAt: now,
      updatedAt: now,
      inventoryItem: item,
    };
    const transaction = {
      inventoryReservation: {
        findUnique: jest.fn(() => reservation),
        update: jest.fn(
          (args: { data: { status: InventoryReservationStatus; confirmedAt: Date } }) => {
            reservation.status = args.data.status;
            reservation.confirmedAt = args.data.confirmedAt;
            return reservation;
          },
        ),
        findUniqueOrThrow: jest.fn(() => ({ ...reservation, inventoryItem: { ...item } })),
      },
      inventoryItem: {
        updateMany: jest.fn(
          (args: {
            data: { currentStock: number; reservedStock: number };
            where: { version: number };
          }) => {
            if (args.where.version !== item.version) return { count: 0 };
            item.currentStock = args.data.currentStock;
            item.reservedStock = args.data.reservedStock;
            item.version += 1;
            return { count: 1 };
          },
        ),
      },
      inventoryMovement: {
        create: jest.fn(() => ({ id: 'movement-id' })),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    const service = new InventoryService(prisma as unknown as PrismaService, {} as CatalogService);

    const result = await service.confirmReservation(reservation.id);

    expect(result.status).toBe(InventoryReservationStatus.CONFIRMED);
    expect(result.availableStock).toBe(8);
    expect(item.currentStock).toBe(8);
    expect(item.reservedStock).toBe(0);
    expect(transaction.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: InventoryMovementType.CONFIRMED,
        currentStockDelta: -2,
        reservedStockDelta: -2,
        resultingCurrentStock: 8,
        resultingReservedStock: 0,
      }) as Record<string, unknown>,
    });
  });
});
