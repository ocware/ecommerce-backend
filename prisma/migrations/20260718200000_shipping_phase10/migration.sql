-- CreateEnum
CREATE TYPE "ShippingMethodType" AS ENUM ('STANDARD', 'EXPRESS', 'LOCAL_PICKUP');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'CREATED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'FAILED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "shippingMethodId" UUID,
ADD COLUMN "shippingMethodSnapshot" JSONB;

-- CreateTable
CREATE TABLE "ShippingMethod" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "provider" TEXT NOT NULL,
    "type" "ShippingMethodType" NOT NULL DEFAULT 'STANDARD',
    "currency" VARCHAR(3) NOT NULL,
    "defaultPrice" DECIMAL(18,2) NOT NULL,
    "freeShippingThreshold" DECIMAL(18,2),
    "estimatedMinDays" INTEGER NOT NULL,
    "estimatedMaxDays" INTEGER NOT NULL,
    "pickupInstructions" TEXT,
    "pickupAddress" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingZone" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "countries" TEXT[] NOT NULL,
    "provinces" TEXT[] NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingRate" (
    "id" UUID NOT NULL,
    "shippingMethodId" UUID NOT NULL,
    "shippingZoneId" UUID NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "freeShippingThreshold" DECIMAL(18,2),
    "minimumOrderAmount" DECIMAL(18,2),
    "maximumOrderAmount" DECIMAL(18,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "shippingMethodId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerReference" TEXT,
    "trackingCode" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "cost" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "addressSnapshot" JSONB NOT NULL,
    "estimatedDeliveryAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentStatusHistory" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShippingMethod_code_key" ON "ShippingMethod"("code");
CREATE INDEX "ShippingMethod_isActive_type_idx" ON "ShippingMethod"("isActive", "type");
CREATE INDEX "ShippingMethod_provider_idx" ON "ShippingMethod"("provider");
CREATE INDEX "ShippingZone_isActive_priority_idx" ON "ShippingZone"("isActive", "priority");
CREATE UNIQUE INDEX "ShippingRate_shippingMethodId_shippingZoneId_key" ON "ShippingRate"("shippingMethodId", "shippingZoneId");
CREATE INDEX "ShippingRate_shippingZoneId_isActive_idx" ON "ShippingRate"("shippingZoneId", "isActive");
CREATE UNIQUE INDEX "Shipment_provider_providerReference_key" ON "Shipment"("provider", "providerReference");
CREATE INDEX "Shipment_orderId_createdAt_idx" ON "Shipment"("orderId", "createdAt");
CREATE INDEX "Shipment_trackingCode_idx" ON "Shipment"("trackingCode");
CREATE INDEX "Shipment_status_updatedAt_idx" ON "Shipment"("status", "updatedAt");
CREATE INDEX "ShipmentStatusHistory_shipmentId_occurredAt_idx" ON "ShipmentStatusHistory"("shipmentId", "occurredAt");
CREATE INDEX "Order_shippingMethodId_idx" ON "Order"("shippingMethodId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shippingMethodId_fkey" FOREIGN KEY ("shippingMethodId") REFERENCES "ShippingMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_shippingMethodId_fkey" FOREIGN KEY ("shippingMethodId") REFERENCES "ShippingMethod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_shippingZoneId_fkey" FOREIGN KEY ("shippingZoneId") REFERENCES "ShippingZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_shippingMethodId_fkey" FOREIGN KEY ("shippingMethodId") REFERENCES "ShippingMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentStatusHistory" ADD CONSTRAINT "ShipmentStatusHistory_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
