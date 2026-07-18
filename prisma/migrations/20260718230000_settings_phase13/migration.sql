CREATE TABLE "ShopSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "shopName" TEXT NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "taxEnabled" BOOLEAN NOT NULL DEFAULT false,
  "taxRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "defaultShippingMethodId" UUID,
  "orderPrefix" VARCHAR(12) NOT NULL DEFAULT 'ORD',
  "lowStockThreshold" INTEGER NOT NULL DEFAULT 0,
  "guestCheckoutEnabled" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedByStaffUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShopSettings_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "ShopSettings_taxRate_check" CHECK ("taxRate" >= 0 AND "taxRate" <= 100),
  CONSTRAINT "ShopSettings_orderPrefix_check" CHECK ("orderPrefix" ~ '^[A-Z0-9]{2,12}$'),
  CONSTRAINT "ShopSettings_lowStockThreshold_check" CHECK ("lowStockThreshold" >= 0)
);

CREATE INDEX "ShopSettings_defaultShippingMethodId_idx" ON "ShopSettings"("defaultShippingMethodId");
CREATE INDEX "ShopSettings_updatedByStaffUserId_idx" ON "ShopSettings"("updatedByStaffUserId");

INSERT INTO "ShopSettings" (
  "id",
  "shopName",
  "currency",
  "taxEnabled",
  "taxRate",
  "orderPrefix",
  "lowStockThreshold",
  "guestCheckoutEnabled",
  "updatedAt"
) VALUES (
  'default',
  'Example Store',
  'IRR',
  false,
  0,
  'ORD',
  0,
  true,
  CURRENT_TIMESTAMP
);
