ALTER TABLE "ShopSettings"
  ADD COLUMN "shopActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "footerText" TEXT;
