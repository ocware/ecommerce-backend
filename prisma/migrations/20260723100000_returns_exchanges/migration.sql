CREATE TYPE "ReturnRequestType" AS ENUM ('RETURN', 'EXCHANGE');
CREATE TYPE "ReturnRequestStatus" AS ENUM (
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'RECEIVED',
  'REFUNDED',
  'REPLACEMENT_CREATED',
  'CLOSED',
  'CANCELLED'
);

ALTER TABLE "ShopSettings"
  ADD COLUMN "returnsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "returnWindowDays" INTEGER NOT NULL DEFAULT 7,
  ADD CONSTRAINT "ShopSettings_returnWindowDays_check"
    CHECK ("returnWindowDays" BETWEEN 1 AND 365);

CREATE TABLE "ReturnRequest" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "type" "ReturnRequestType" NOT NULL,
  "status" "ReturnRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason" TEXT NOT NULL,
  "customerNote" TEXT,
  "adminNote" TEXT,
  "replacementOrderId" UUID,
  "reviewedByStaffId" UUID,
  "reviewedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReturnRequest_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReturnRequest_replacementOrderId_fkey"
    FOREIGN KEY ("replacementOrderId") REFERENCES "Order"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ReturnRequest_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ReturnRequestItem" (
  "id" UUID NOT NULL,
  "returnRequestId" UUID NOT NULL,
  "orderItemId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnRequestItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReturnRequestItem_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "ReturnRequestItem_returnRequestId_fkey"
    FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReturnRequestItem_orderItemId_fkey"
    FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ReturnRequest_replacementOrderId_key"
  ON "ReturnRequest"("replacementOrderId");
CREATE INDEX "ReturnRequest_customerId_createdAt_idx"
  ON "ReturnRequest"("customerId", "createdAt");
CREATE INDEX "ReturnRequest_orderId_createdAt_idx"
  ON "ReturnRequest"("orderId", "createdAt");
CREATE INDEX "ReturnRequest_status_createdAt_idx"
  ON "ReturnRequest"("status", "createdAt");
CREATE INDEX "ReturnRequest_type_status_idx"
  ON "ReturnRequest"("type", "status");
CREATE UNIQUE INDEX "ReturnRequestItem_returnRequestId_orderItemId_key"
  ON "ReturnRequestItem"("returnRequestId", "orderItemId");
CREATE INDEX "ReturnRequestItem_orderItemId_idx"
  ON "ReturnRequestItem"("orderItemId");
