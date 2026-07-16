CREATE TYPE "InventoryMovementType" AS ENUM (
  'INITIALIZED',
  'ADJUSTED',
  'RESERVED',
  'RELEASED',
  'CONFIRMED',
  'RESTORED'
);

CREATE TYPE "InventoryReservationStatus" AS ENUM (
  'ACTIVE',
  'CONFIRMED',
  'RELEASED',
  'EXPIRED'
);

CREATE TABLE "InventoryItem" (
  "id" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "currentStock" INTEGER NOT NULL DEFAULT 0,
  "reservedStock" INTEGER NOT NULL DEFAULT 0,
  "lowStockThreshold" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryItem_currentStock_check" CHECK ("currentStock" >= 0),
  CONSTRAINT "InventoryItem_reservedStock_check" CHECK ("reservedStock" >= 0),
  CONSTRAINT "InventoryItem_stock_balance_check" CHECK ("reservedStock" <= "currentStock"),
  CONSTRAINT "InventoryItem_lowStockThreshold_check" CHECK ("lowStockThreshold" >= 0)
);

CREATE TABLE "InventoryMovement" (
  "id" UUID NOT NULL,
  "inventoryItemId" UUID NOT NULL,
  "reservationId" UUID,
  "type" "InventoryMovementType" NOT NULL,
  "currentStockDelta" INTEGER NOT NULL DEFAULT 0,
  "reservedStockDelta" INTEGER NOT NULL DEFAULT 0,
  "resultingCurrentStock" INTEGER NOT NULL,
  "resultingReservedStock" INTEGER NOT NULL,
  "reason" TEXT,
  "idempotencyKey" TEXT,
  "staffUserId" UUID,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryReservation" (
  "id" UUID NOT NULL,
  "inventoryItemId" UUID NOT NULL,
  "externalReference" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "status" "InventoryReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryReservation_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "InventoryItem_variantId_key" ON "InventoryItem"("variantId");
CREATE INDEX "InventoryItem_lowStockThreshold_idx" ON "InventoryItem"("lowStockThreshold");
CREATE UNIQUE INDEX "InventoryMovement_idempotencyKey_key" ON "InventoryMovement"("idempotencyKey");
CREATE INDEX "InventoryMovement_inventoryItemId_createdAt_idx" ON "InventoryMovement"("inventoryItemId", "createdAt");
CREATE INDEX "InventoryMovement_reservationId_idx" ON "InventoryMovement"("reservationId");
CREATE INDEX "InventoryMovement_type_createdAt_idx" ON "InventoryMovement"("type", "createdAt");
CREATE INDEX "InventoryMovement_staffUserId_idx" ON "InventoryMovement"("staffUserId");
CREATE UNIQUE INDEX "InventoryReservation_externalReference_key" ON "InventoryReservation"("externalReference");
CREATE INDEX "InventoryReservation_inventoryItemId_status_idx" ON "InventoryReservation"("inventoryItemId", "status");
CREATE INDEX "InventoryReservation_status_expiresAt_idx" ON "InventoryReservation"("status", "expiresAt");

ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "InventoryItem_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "InventoryReservation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryReservation"
  ADD CONSTRAINT "InventoryReservation_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
