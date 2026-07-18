import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryMovementType, InventoryReservationStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CatalogService } from '../../catalog/services/catalog.service';
import {
  calculateAvailableStock,
  isLowStock,
  isValidStockState,
} from '../domain/inventory-calculations';
import { AdjustInventoryDto } from '../dto/adjust-inventory.dto';
import { CreateStockReservationDto } from '../dto/create-stock-reservation.dto';
import { InitializeInventoryDto } from '../dto/initialize-inventory.dto';
import { ListInventoryQueryDto } from '../dto/list-inventory-query.dto';
import { ListStockMovementsQueryDto } from '../dto/list-stock-movements-query.dto';
import { RestoreStockDto } from '../dto/restore-stock.dto';
import { UpdateLowStockThresholdDto } from '../dto/update-low-stock-threshold.dto';
import { InventoryEventPublisher } from './inventory-event-publisher.service';

type ReservationWithInventory = Prisma.InventoryReservationGetPayload<{
  include: { inventoryItem: true };
}>;

class InventoryWriteConflict extends Error {}

@Injectable()
export class InventoryService {
  private readonly maxWriteAttempts = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: CatalogService,
    private readonly eventPublisher: InventoryEventPublisher,
  ) {}

  async initializeInventory(dto: InitializeInventoryDto, staffUserId?: string) {
    const variant = await this.catalogService.getVariantReference(dto.variantId);

    try {
      const item = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.inventoryItem.create({
          data: {
            variantId: dto.variantId,
            currentStock: dto.currentStock,
            lowStockThreshold: dto.lowStockThreshold,
          },
        });
        await transaction.inventoryMovement.create({
          data: {
            inventoryItemId: created.id,
            type: InventoryMovementType.INITIALIZED,
            currentStockDelta: dto.currentStock,
            resultingCurrentStock: dto.currentStock,
            resultingReservedStock: 0,
            reason: 'Inventory initialized.',
            staffUserId,
          },
        });
        return created;
      });

      this.publishIfLow(item);
      return { ...this.toInventorySummary(item), variant };
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new ConflictException({
          code: 'INVENTORY_ALREADY_INITIALIZED',
          message: 'Inventory already exists for this product variant.',
        });
      }
      throw error;
    }
  }

  async getInventory(variantId: string) {
    const [item, variant] = await Promise.all([
      this.requireInventory(variantId),
      this.catalogService.getVariantReference(variantId),
    ]);
    return { ...this.toInventorySummary(item), variant };
  }

  async getAvailability(variantId: string) {
    const item = await this.requireInventory(variantId);
    const availableStock = calculateAvailableStock(item);
    return {
      variantId,
      availableStock,
      inStock: availableStock > 0,
      lowStock: isLowStock(item),
    };
  }

  async listInventory(query: ListInventoryQueryDto) {
    const records = await this.prisma.inventoryItem.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    const filtered =
      query.lowStock === undefined
        ? records
        : records.filter((item) => isLowStock(item) === query.lowStock);
    const start = (query.page - 1) * query.limit;
    const items = filtered.slice(start, start + query.limit);
    const variants = await this.catalogService.getVariantReferences(
      items.map((item) => item.variantId),
    );
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));

    return {
      items: items.map((item) => ({
        ...this.toInventorySummary(item),
        variant: variantById.get(item.variantId) ?? null,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: filtered.length,
        pageCount: Math.ceil(filtered.length / query.limit),
      },
    };
  }

  async updateLowStockThreshold(variantId: string, dto: UpdateLowStockThresholdDto) {
    const item = await this.requireInventory(variantId);
    const updated = await this.prisma.inventoryItem.update({
      where: { id: item.id },
      data: {
        lowStockThreshold: dto.lowStockThreshold,
        version: { increment: 1 },
      },
    });
    this.publishIfLow(updated);
    return this.toInventorySummary(updated);
  }

  async adjustStock(variantId: string, dto: AdjustInventoryDto, staffUserId?: string) {
    const item = await this.withOptimisticRetry(async (transaction) => {
      const current = await this.requireInventoryInTransaction(transaction, variantId);
      const resultingCurrentStock = current.currentStock + dto.quantityDelta;
      const resultingState = {
        currentStock: resultingCurrentStock,
        reservedStock: current.reservedStock,
      };

      if (!isValidStockState(resultingState)) {
        throw new ConflictException({
          code: 'INVALID_STOCK_ADJUSTMENT',
          message: 'The adjustment would reduce current stock below reserved or zero stock.',
          details: {
            variantId,
            currentStock: current.currentStock,
            reservedStock: current.reservedStock,
            quantityDelta: dto.quantityDelta,
          },
        });
      }

      await this.updateStockState(transaction, current, resultingState);
      await transaction.inventoryMovement.create({
        data: {
          inventoryItemId: current.id,
          type: InventoryMovementType.ADJUSTED,
          currentStockDelta: dto.quantityDelta,
          resultingCurrentStock,
          resultingReservedStock: current.reservedStock,
          reason: dto.reason,
          staffUserId,
          metadata: dto.reference ? { reference: dto.reference } : undefined,
        },
      });
      return transaction.inventoryItem.findUniqueOrThrow({ where: { id: current.id } });
    });

    this.publishIfLow(item);
    return this.toInventorySummary(item);
  }

  async reserveStock(dto: CreateStockReservationDto) {
    const expiresAt = new Date(dto.expiresAt);
    if (expiresAt <= new Date()) {
      throw new BadRequestException({
        code: 'INVALID_RESERVATION_EXPIRATION',
        message: 'Inventory reservation expiration must be in the future.',
      });
    }

    const existing = await this.prisma.inventoryReservation.findUnique({
      where: { externalReference: dto.externalReference },
      include: { inventoryItem: true },
    });
    if (existing) {
      return this.resolveExistingReservation(existing, dto);
    }

    try {
      const reservation = await this.withOptimisticRetry(async (transaction) => {
        const item = await this.requireInventoryInTransaction(transaction, dto.variantId);
        const availableStock = calculateAvailableStock(item);
        if (availableStock < dto.quantity) {
          throw new ConflictException({
            code: 'INSUFFICIENT_STOCK',
            message: 'The requested quantity is unavailable.',
            details: {
              variantId: dto.variantId,
              requested: dto.quantity,
              available: availableStock,
            },
          });
        }

        const resultingReservedStock = item.reservedStock + dto.quantity;
        await this.updateStockState(transaction, item, {
          currentStock: item.currentStock,
          reservedStock: resultingReservedStock,
        });
        const created = await transaction.inventoryReservation.create({
          data: {
            inventoryItemId: item.id,
            externalReference: dto.externalReference,
            quantity: dto.quantity,
            expiresAt,
          },
        });
        await transaction.inventoryMovement.create({
          data: {
            inventoryItemId: item.id,
            reservationId: created.id,
            type: InventoryMovementType.RESERVED,
            reservedStockDelta: dto.quantity,
            resultingCurrentStock: item.currentStock,
            resultingReservedStock,
            reason: 'Stock reserved for checkout.',
          },
        });
        return transaction.inventoryReservation.findUniqueOrThrow({
          where: { id: created.id },
          include: { inventoryItem: true },
        });
      });

      this.publishIfLow(reservation.inventoryItem);
      return this.toReservationSummary(reservation);
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const duplicate = await this.prisma.inventoryReservation.findUnique({
          where: { externalReference: dto.externalReference },
          include: { inventoryItem: true },
        });
        if (duplicate) {
          return this.resolveExistingReservation(duplicate, dto);
        }
      }
      throw error;
    }
  }

  async confirmReservation(id: string) {
    const outcome = await this.withOptimisticRetry(async (transaction) => {
      const reservation = await this.requireReservationInTransaction(transaction, id);
      if (reservation.status === InventoryReservationStatus.CONFIRMED) {
        return { expired: false, reservation };
      }
      if (reservation.status !== InventoryReservationStatus.ACTIVE) {
        throw new ConflictException({
          code: 'RESERVATION_NOT_ACTIVE',
          message: 'Only active inventory reservations can be confirmed.',
        });
      }

      if (reservation.expiresAt <= new Date()) {
        const expired = await this.releaseInTransaction(transaction, reservation, true);
        return { expired: true, reservation: expired };
      }

      const item = reservation.inventoryItem;
      const resultingState = {
        currentStock: item.currentStock - reservation.quantity,
        reservedStock: item.reservedStock - reservation.quantity,
      };
      if (!isValidStockState(resultingState)) {
        throw new ConflictException({
          code: 'INVALID_INVENTORY_STATE',
          message: 'Inventory state no longer supports this reservation.',
        });
      }

      await this.updateStockState(transaction, item, resultingState);
      await transaction.inventoryReservation.update({
        where: { id },
        data: {
          status: InventoryReservationStatus.CONFIRMED,
          confirmedAt: new Date(),
        },
      });
      await transaction.inventoryMovement.create({
        data: {
          inventoryItemId: item.id,
          reservationId: id,
          type: InventoryMovementType.CONFIRMED,
          currentStockDelta: -reservation.quantity,
          reservedStockDelta: -reservation.quantity,
          resultingCurrentStock: resultingState.currentStock,
          resultingReservedStock: resultingState.reservedStock,
          reason: 'Reserved stock confirmed as sold.',
        },
      });
      const updated = await transaction.inventoryReservation.findUniqueOrThrow({
        where: { id },
        include: { inventoryItem: true },
      });
      return { expired: false, reservation: updated };
    });

    if (outcome.expired) {
      throw new ConflictException({
        code: 'RESERVATION_EXPIRED',
        message: 'The inventory reservation expired before confirmation.',
      });
    }
    return this.toReservationSummary(outcome.reservation);
  }

  async confirmReservations(ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) return [];

    const reservations = await this.withOptimisticRetry(async (transaction) => {
      const current = await transaction.inventoryReservation.findMany({
        where: { id: { in: uniqueIds } },
        include: { inventoryItem: true },
      });
      if (current.length !== uniqueIds.length) {
        throw new NotFoundException({
          code: 'INVENTORY_RESERVATION_NOT_FOUND',
          message: 'One or more inventory reservations were not found.',
        });
      }
      const expired = current.find(
        (reservation) =>
          reservation.status === InventoryReservationStatus.ACTIVE &&
          reservation.expiresAt <= new Date(),
      );
      if (expired) {
        throw new ConflictException({
          code: 'RESERVATION_EXPIRED',
          message: 'An inventory reservation expired before confirmation.',
          details: { reservationId: expired.id },
        });
      }
      const invalid = current.find(
        (reservation) =>
          reservation.status !== InventoryReservationStatus.ACTIVE &&
          reservation.status !== InventoryReservationStatus.CONFIRMED,
      );
      if (invalid) {
        throw new ConflictException({
          code: 'RESERVATION_NOT_ACTIVE',
          message: 'An inventory reservation is no longer active.',
          details: { reservationId: invalid.id, status: invalid.status },
        });
      }

      for (const reservation of current) {
        if (reservation.status === InventoryReservationStatus.CONFIRMED) continue;
        const item = reservation.inventoryItem;
        const resultingState = {
          currentStock: item.currentStock - reservation.quantity,
          reservedStock: item.reservedStock - reservation.quantity,
        };
        if (!isValidStockState(resultingState)) {
          throw new ConflictException({
            code: 'INVALID_RESERVATION_CONFIRMATION',
            message: 'Inventory state no longer supports this reservation.',
          });
        }
        await this.updateStockState(transaction, item, resultingState);
        await transaction.inventoryReservation.update({
          where: { id: reservation.id },
          data: { status: InventoryReservationStatus.CONFIRMED, confirmedAt: new Date() },
        });
        await transaction.inventoryMovement.create({
          data: {
            inventoryItemId: item.id,
            reservationId: reservation.id,
            type: InventoryMovementType.CONFIRMED,
            currentStockDelta: -reservation.quantity,
            reservedStockDelta: -reservation.quantity,
            resultingCurrentStock: resultingState.currentStock,
            resultingReservedStock: resultingState.reservedStock,
            reason: 'Reserved stock confirmed as sold.',
          },
        });
      }
      return transaction.inventoryReservation.findMany({
        where: { id: { in: uniqueIds } },
        include: { inventoryItem: true },
      });
    });

    return reservations.map((reservation) => this.toReservationSummary(reservation));
  }

  async releaseReservation(id: string) {
    const reservation = await this.withOptimisticRetry(async (transaction) => {
      const current = await this.requireReservationInTransaction(transaction, id);
      if (
        current.status === InventoryReservationStatus.RELEASED ||
        current.status === InventoryReservationStatus.EXPIRED
      ) {
        return current;
      }
      if (current.status === InventoryReservationStatus.CONFIRMED) {
        throw new ConflictException({
          code: 'RESERVATION_ALREADY_CONFIRMED',
          message: 'Confirmed inventory reservations cannot be released.',
        });
      }
      return this.releaseInTransaction(transaction, current, false);
    });
    return this.toReservationSummary(reservation);
  }

  async expireReservations(limit = 100) {
    const reservations = await this.prisma.inventoryReservation.findMany({
      where: {
        status: InventoryReservationStatus.ACTIVE,
        expiresAt: { lte: new Date() },
      },
      select: { id: true },
      orderBy: { expiresAt: 'asc' },
      take: limit,
    });
    let expired = 0;

    for (const reservation of reservations) {
      const result = await this.expireReservation(reservation.id);
      if (result.status === InventoryReservationStatus.EXPIRED) {
        expired += 1;
      }
    }
    return { examined: reservations.length, expired };
  }

  async restoreStock(variantId: string, dto: RestoreStockDto, staffUserId?: string) {
    const idempotencyKey = `inventory-restore:${dto.reference}`;
    const existing = await this.prisma.inventoryMovement.findUnique({
      where: { idempotencyKey },
      include: { inventoryItem: true },
    });
    if (existing) {
      return this.resolveExistingRestoration(existing, variantId, dto.quantity);
    }

    try {
      const item = await this.withOptimisticRetry(async (transaction) => {
        const current = await this.requireInventoryInTransaction(transaction, variantId);
        const resultingCurrentStock = current.currentStock + dto.quantity;
        await this.updateStockState(transaction, current, {
          currentStock: resultingCurrentStock,
          reservedStock: current.reservedStock,
        });
        await transaction.inventoryMovement.create({
          data: {
            inventoryItemId: current.id,
            type: InventoryMovementType.RESTORED,
            currentStockDelta: dto.quantity,
            resultingCurrentStock,
            resultingReservedStock: current.reservedStock,
            reason: dto.reason ?? 'Stock restored after cancellation or return.',
            idempotencyKey,
            staffUserId,
          },
        });
        return transaction.inventoryItem.findUniqueOrThrow({ where: { id: current.id } });
      });
      return this.toInventorySummary(item);
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const duplicate = await this.prisma.inventoryMovement.findUnique({
          where: { idempotencyKey },
          include: { inventoryItem: true },
        });
        if (duplicate) {
          return this.resolveExistingRestoration(duplicate, variantId, dto.quantity);
        }
      }
      throw error;
    }
  }

  async listMovements(variantId: string, query: ListStockMovementsQueryDto) {
    const item = await this.requireInventory(variantId);
    const skip = (query.page - 1) * query.limit;
    const [total, movements] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.count({ where: { inventoryItemId: item.id } }),
      this.prisma.inventoryMovement.findMany({
        where: { inventoryItemId: item.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
    ]);
    return {
      items: movements,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pageCount: Math.ceil(total / query.limit),
      },
    };
  }

  private async expireReservation(id: string) {
    return this.withOptimisticRetry(async (transaction) => {
      const reservation = await this.requireReservationInTransaction(transaction, id);
      if (reservation.status !== InventoryReservationStatus.ACTIVE) {
        return reservation;
      }
      if (reservation.expiresAt > new Date()) {
        return reservation;
      }
      return this.releaseInTransaction(transaction, reservation, true);
    });
  }

  private async releaseInTransaction(
    transaction: Prisma.TransactionClient,
    reservation: ReservationWithInventory,
    expired: boolean,
  ): Promise<ReservationWithInventory> {
    const item = reservation.inventoryItem;
    const resultingReservedStock = item.reservedStock - reservation.quantity;
    const resultingState = {
      currentStock: item.currentStock,
      reservedStock: resultingReservedStock,
    };
    if (!isValidStockState(resultingState)) {
      throw new ConflictException({
        code: 'INVALID_INVENTORY_STATE',
        message: 'Inventory state no longer supports releasing this reservation.',
      });
    }

    await this.updateStockState(transaction, item, resultingState);
    await transaction.inventoryReservation.update({
      where: { id: reservation.id },
      data: {
        status: expired ? InventoryReservationStatus.EXPIRED : InventoryReservationStatus.RELEASED,
        releasedAt: new Date(),
      },
    });
    await transaction.inventoryMovement.create({
      data: {
        inventoryItemId: item.id,
        reservationId: reservation.id,
        type: InventoryMovementType.RELEASED,
        reservedStockDelta: -reservation.quantity,
        resultingCurrentStock: item.currentStock,
        resultingReservedStock,
        reason: expired ? 'Expired stock reservation released.' : 'Stock reservation released.',
      },
    });
    return transaction.inventoryReservation.findUniqueOrThrow({
      where: { id: reservation.id },
      include: { inventoryItem: true },
    });
  }

  private async updateStockState(
    transaction: Prisma.TransactionClient,
    current: { id: string; version: number },
    state: { currentStock: number; reservedStock: number },
  ): Promise<void> {
    const result = await transaction.inventoryItem.updateMany({
      where: { id: current.id, version: current.version },
      data: {
        currentStock: state.currentStock,
        reservedStock: state.reservedStock,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw new InventoryWriteConflict();
    }
  }

  private async withOptimisticRetry<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= this.maxWriteAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (!this.isRetryableWriteConflict(error) || attempt === this.maxWriteAttempts) {
          if (this.isRetryableWriteConflict(error)) {
            throw new ConflictException({
              code: 'INVENTORY_WRITE_CONFLICT',
              message: 'Inventory changed concurrently. Retry the operation.',
            });
          }
          throw error;
        }
      }
    }
    throw new ConflictException({
      code: 'INVENTORY_WRITE_CONFLICT',
      message: 'Inventory changed concurrently. Retry the operation.',
    });
  }

  private async requireInventory(variantId: string) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { variantId } });
    if (!item) {
      throw new NotFoundException({
        code: 'INVENTORY_NOT_FOUND',
        message: 'Inventory was not initialized for this product variant.',
      });
    }
    return item;
  }

  private async requireInventoryInTransaction(
    transaction: Prisma.TransactionClient,
    variantId: string,
  ) {
    const item = await transaction.inventoryItem.findUnique({ where: { variantId } });
    if (!item) {
      throw new NotFoundException({
        code: 'INVENTORY_NOT_FOUND',
        message: 'Inventory was not initialized for this product variant.',
      });
    }
    return item;
  }

  private async requireReservationInTransaction(
    transaction: Prisma.TransactionClient,
    id: string,
  ): Promise<ReservationWithInventory> {
    const reservation = await transaction.inventoryReservation.findUnique({
      where: { id },
      include: { inventoryItem: true },
    });
    if (!reservation) {
      throw new NotFoundException({
        code: 'RESERVATION_NOT_FOUND',
        message: 'Inventory reservation was not found.',
      });
    }
    return reservation;
  }

  private resolveExistingReservation(
    reservation: ReservationWithInventory,
    dto: CreateStockReservationDto,
  ) {
    if (
      reservation.inventoryItem.variantId !== dto.variantId ||
      reservation.quantity !== dto.quantity
    ) {
      throw new ConflictException({
        code: 'RESERVATION_REFERENCE_CONFLICT',
        message: 'The reservation reference is already used for different inventory.',
      });
    }
    return this.toReservationSummary(reservation);
  }

  private resolveExistingRestoration(
    movement: Prisma.InventoryMovementGetPayload<{ include: { inventoryItem: true } }>,
    variantId: string,
    quantity: number,
  ) {
    if (movement.inventoryItem.variantId !== variantId || movement.currentStockDelta !== quantity) {
      throw new ConflictException({
        code: 'RESTORATION_REFERENCE_CONFLICT',
        message: 'The restoration reference is already used for a different stock change.',
      });
    }
    return this.toInventorySummary(movement.inventoryItem);
  }

  private toInventorySummary<
    T extends {
      currentStock: number;
      reservedStock: number;
      lowStockThreshold: number;
    },
  >(item: T) {
    return {
      ...item,
      availableStock: calculateAvailableStock(item),
      lowStock: isLowStock(item),
    };
  }

  private toReservationSummary(reservation: ReservationWithInventory) {
    return {
      id: reservation.id,
      variantId: reservation.inventoryItem.variantId,
      externalReference: reservation.externalReference,
      quantity: reservation.quantity,
      status: reservation.status,
      expiresAt: reservation.expiresAt,
      confirmedAt: reservation.confirmedAt,
      releasedAt: reservation.releasedAt,
      availableStock: calculateAvailableStock(reservation.inventoryItem),
    };
  }

  private publishIfLow(item: {
    id: string;
    variantId: string;
    currentStock: number;
    reservedStock: number;
    lowStockThreshold: number;
    version: number;
  }): void {
    if (!isLowStock(item)) return;
    this.eventPublisher.publish({
      name: 'InventoryLow',
      occurredAt: new Date(),
      eventId: `${item.id}:${item.version}`,
      inventoryItemId: item.id,
      variantId: item.variantId,
      availableStock: calculateAvailableStock(item),
      lowStockThreshold: item.lowStockThreshold,
    });
  }

  private isUniqueConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private isRetryableWriteConflict(error: unknown): boolean {
    return (
      error instanceof InventoryWriteConflict ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
    );
  }
}
