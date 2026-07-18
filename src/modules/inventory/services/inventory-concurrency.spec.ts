import { InventoryReservationStatus, ProductVariantStatus } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CatalogService } from '../../catalog/services/catalog.service';
import { SettingsService } from '../../settings/services/settings.service';
import { InventoryEventPublisher } from './inventory-event-publisher.service';
import { InventoryService } from './inventory.service';

type StockState = {
  id: string;
  variantId: string;
  currentStock: number;
  reservedStock: number;
  lowStockThreshold: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type UpdateStockArgs = {
  where: { id: string; version: number };
  data: { currentStock: number; reservedStock: number };
};

type CreateReservationArgs = {
  data: {
    inventoryItemId: string;
    externalReference: string;
    quantity: number;
    expiresAt: Date;
  };
};

type FindReservationArgs = { where: { id: string } };

describe('InventoryService concurrency', () => {
  it('allows only one concurrent reservation for the last unit', async () => {
    const now = new Date();
    const state: StockState = {
      id: 'inventory-id',
      variantId: '11111111-1111-4111-8111-111111111111',
      currentStock: 1,
      reservedStock: 0,
      lowStockThreshold: 0,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    const reservations = new Map<
      string,
      {
        id: string;
        inventoryItemId: string;
        externalReference: string;
        quantity: number;
        status: InventoryReservationStatus;
        expiresAt: Date;
        confirmedAt: null;
        releasedAt: null;
        createdAt: Date;
        updatedAt: Date;
      }
    >();
    const transaction = {
      inventoryItem: {
        findUnique: jest.fn(() => ({ ...state })),
        updateMany: jest.fn((args: UpdateStockArgs) => {
          if (args.where.version !== state.version) {
            return { count: 0 };
          }
          state.currentStock = args.data.currentStock;
          state.reservedStock = args.data.reservedStock;
          state.version += 1;
          return { count: 1 };
        }),
      },
      inventoryReservation: {
        create: jest.fn((args: CreateReservationArgs) => {
          const reservation = {
            id: `reservation-${reservations.size + 1}`,
            inventoryItemId: args.data.inventoryItemId,
            externalReference: args.data.externalReference,
            quantity: args.data.quantity,
            status: InventoryReservationStatus.ACTIVE,
            expiresAt: args.data.expiresAt,
            confirmedAt: null,
            releasedAt: null,
            createdAt: now,
            updatedAt: now,
          };
          reservations.set(reservation.id, reservation);
          return reservation;
        }),
        findUniqueOrThrow: jest.fn((args: FindReservationArgs) => ({
          ...reservations.get(args.where.id)!,
          inventoryItem: { ...state },
        })),
      },
      inventoryMovement: {
        create: jest.fn(() => ({ id: 'movement-id' })),
      },
    };
    const prisma = {
      inventoryReservation: {
        findUnique: jest.fn(() => null),
      },
      $transaction: jest.fn((operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    const catalog = {
      getVariantReference: jest.fn(() => ({
        id: state.variantId,
        productId: 'product-id',
        name: 'Default',
        sku: 'LAST-ONE',
        status: ProductVariantStatus.ACTIVE,
      })),
    };
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      catalog as unknown as CatalogService,
      { publish: jest.fn() } as unknown as InventoryEventPublisher,
      {} as SettingsService,
    );
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    const results = await Promise.allSettled([
      service.reserveStock({
        variantId: state.variantId,
        quantity: 1,
        externalReference: 'checkout-one',
        expiresAt,
      }),
      service.reserveStock({
        variantId: state.variantId,
        quantity: 1,
        externalReference: 'checkout-two',
        expiresAt,
      }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(
      rejected && rejected.status === 'rejected' ? (rejected.reason as unknown) : null,
    ).toMatchObject({
      response: expect.objectContaining({ code: 'INSUFFICIENT_STOCK' }) as Record<string, unknown>,
    });
    expect(state.reservedStock).toBe(1);
    expect(reservations.size).toBe(1);
  });
});
