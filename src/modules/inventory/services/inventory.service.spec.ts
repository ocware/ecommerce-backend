import { InventoryMovementType, InventoryReservationStatus } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CatalogService } from '../../catalog/services/catalog.service';
import { InventoryEventPublisher } from './inventory-event-publisher.service';
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
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      {} as CatalogService,
      { publish: jest.fn() } as unknown as InventoryEventPublisher,
    );

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

  it('confirms all checkout reservations in one transaction', async () => {
    const now = new Date();
    const items = [
      {
        id: 'inventory-1',
        variantId: '33333333-3333-4333-8333-333333333333',
        currentStock: 5,
        reservedStock: 2,
        lowStockThreshold: 0,
        version: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'inventory-2',
        variantId: '44444444-4444-4444-8444-444444444444',
        currentStock: 8,
        reservedStock: 3,
        lowStockThreshold: 0,
        version: 0,
        createdAt: now,
        updatedAt: now,
      },
    ];
    const activeStatus: InventoryReservationStatus = InventoryReservationStatus.ACTIVE;
    const reservations = items.map((inventoryItem, index) => ({
      id: `55555555-5555-4555-8555-55555555555${index}`,
      inventoryItemId: inventoryItem.id,
      externalReference: `order-item-${index}`,
      quantity: index + 2,
      status: activeStatus,
      expiresAt: new Date(Date.now() + 60_000),
      confirmedAt: null as Date | null,
      releasedAt: null,
      createdAt: now,
      updatedAt: now,
      inventoryItem,
    }));
    const confirmedReservationIds = new Set<string>();
    const transaction = {
      inventoryReservation: {
        findMany: jest.fn(() =>
          reservations.map((reservation) => ({
            ...reservation,
            status: confirmedReservationIds.has(reservation.id)
              ? InventoryReservationStatus.CONFIRMED
              : InventoryReservationStatus.ACTIVE,
            confirmedAt: confirmedReservationIds.has(reservation.id) ? new Date() : null,
          })),
        ),
        update: jest.fn(
          (input: {
            where: { id: string };
            data: { status: InventoryReservationStatus; confirmedAt: Date };
          }) => {
            const reservation = reservations.find((entry) => entry.id === input.where.id)!;
            confirmedReservationIds.add(reservation.id);
            return { ...reservation, ...input.data };
          },
        ),
      },
      inventoryItem: {
        updateMany: jest.fn(
          (input: {
            where: { id: string; version: number };
            data: { currentStock: number; reservedStock: number; version: { increment: number } };
          }) => {
            const item = items.find((entry) => entry.id === input.where.id)!;
            if (item.version !== input.where.version) return { count: 0 };
            item.currentStock = input.data.currentStock;
            item.reservedStock = input.data.reservedStock;
            item.version += input.data.version.increment;
            return { count: 1 };
          },
        ),
      },
      inventoryMovement: { create: jest.fn(() => ({ id: 'movement-id' })) },
    };
    const prisma = {
      $transaction: jest.fn((operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      {} as CatalogService,
      { publish: jest.fn() } as unknown as InventoryEventPublisher,
    );

    const result = await service.confirmReservations(reservations.map((entry) => entry.id));

    expect(result).toHaveLength(2);
    expect(result.every((entry) => entry.status === InventoryReservationStatus.CONFIRMED)).toBe(
      true,
    );
    expect(items).toEqual([
      expect.objectContaining({ currentStock: 3, reservedStock: 0 }),
      expect.objectContaining({ currentStock: 5, reservedStock: 0 }),
    ]);
    expect(transaction.inventoryMovement.create).toHaveBeenCalledTimes(2);
  });
});
