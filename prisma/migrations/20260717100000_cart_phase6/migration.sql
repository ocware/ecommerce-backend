CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'EXPIRED', 'ABANDONED');

CREATE TABLE "Cart" (
  "id" UUID NOT NULL,
  "customerId" UUID,
  "guestTokenHash" TEXT,
  "currency" VARCHAR(3) NOT NULL,
  "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
  "discountCode" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Cart_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Cart_owner_check" CHECK (
    ("customerId" IS NOT NULL AND "guestTokenHash" IS NULL) OR
    ("customerId" IS NULL AND "guestTokenHash" IS NOT NULL)
  ),
  CONSTRAINT "Cart_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "CartItem" (
  "id" UUID NOT NULL,
  "cartId" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CartItem_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "Cart_guestTokenHash_key" ON "Cart"("guestTokenHash");
CREATE INDEX "Cart_customerId_status_idx" ON "Cart"("customerId", "status");
CREATE INDEX "Cart_status_expiresAt_idx" ON "Cart"("status", "expiresAt");
CREATE UNIQUE INDEX "Cart_active_customer_currency_key"
  ON "Cart"("customerId", "currency") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "CartItem_cartId_variantId_key" ON "CartItem"("cartId", "variantId");
CREATE INDEX "CartItem_variantId_idx" ON "CartItem"("variantId");

ALTER TABLE "Cart"
  ADD CONSTRAINT "Cart_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_cartId_fkey"
  FOREIGN KEY ("cartId") REFERENCES "Cart"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
