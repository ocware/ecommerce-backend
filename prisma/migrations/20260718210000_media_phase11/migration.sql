CREATE TYPE "MediaAssetType" AS ENUM ('PRODUCT_IMAGE', 'CATEGORY_IMAGE', 'SHOP_LOGO', 'BANNER');
CREATE TYPE "MediaAssetStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED', 'DELETED');

CREATE TABLE "MediaAsset" (
  "id" UUID NOT NULL,
  "type" "MediaAssetType" NOT NULL,
  "status" "MediaAssetStatus" NOT NULL DEFAULT 'PROCESSING',
  "ownerId" UUID,
  "catalogImageId" UUID,
  "storageProvider" TEXT NOT NULL,
  "originalKey" TEXT NOT NULL,
  "originalUrl" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "variants" JSONB,
  "altText" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "linkUrl" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "processingError" TEXT,
  "createdByStaffUserId" UUID NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaAsset_catalogImageId_key" ON "MediaAsset"("catalogImageId");
CREATE UNIQUE INDEX "MediaAsset_originalKey_key" ON "MediaAsset"("originalKey");
CREATE INDEX "MediaAsset_type_ownerId_status_idx" ON "MediaAsset"("type", "ownerId", "status");
CREATE INDEX "MediaAsset_type_isActive_position_idx" ON "MediaAsset"("type", "isActive", "position");
CREATE INDEX "MediaAsset_createdByStaffUserId_idx" ON "MediaAsset"("createdByStaffUserId");
