CREATE TYPE "DiscountMode" AS ENUM ('COUPON', 'AUTOMATIC');
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING');

CREATE TABLE "Discount" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "code" TEXT,
  "mode" "DiscountMode" NOT NULL,
  "type" "DiscountType" NOT NULL,
  "value" DECIMAL(18,2),
  "currency" VARCHAR(3),
  "minimumCartAmount" DECIMAL(18,2),
  "maximumDiscountAmount" DECIMAL(18,2),
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "usageLimit" INTEGER,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "perCustomerUsageLimit" INTEGER,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "isStackable" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Discount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Discount_mode_code_check" CHECK (
    ("mode" = 'COUPON' AND "code" IS NOT NULL AND "code" = UPPER("code")) OR
    ("mode" = 'AUTOMATIC' AND "code" IS NULL)
  ),
  CONSTRAINT "Discount_type_value_check" CHECK (
    ("type" = 'PERCENTAGE' AND "value" > 0 AND "value" <= 100) OR
    ("type" = 'FIXED_AMOUNT' AND "value" > 0 AND "currency" IS NOT NULL) OR
    ("type" = 'FREE_SHIPPING' AND "value" IS NULL)
  ),
  CONSTRAINT "Discount_currency_check" CHECK (
    "currency" IS NULL OR "currency" ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT "Discount_amount_constraints_check" CHECK (
    ("minimumCartAmount" IS NULL OR "minimumCartAmount" >= 0) AND
    ("maximumDiscountAmount" IS NULL OR
      ("type" = 'PERCENTAGE' AND "maximumDiscountAmount" >= 0))
  ),
  CONSTRAINT "Discount_dates_check" CHECK (
    "startsAt" IS NULL OR "endsAt" IS NULL OR "startsAt" < "endsAt"
  ),
  CONSTRAINT "Discount_usage_check" CHECK (
    "usageCount" >= 0 AND
    ("usageLimit" IS NULL OR "usageLimit" > 0) AND
    ("usageLimit" IS NULL OR "usageCount" <= "usageLimit") AND
    ("perCustomerUsageLimit" IS NULL OR "perCustomerUsageLimit" > 0)
  )
);

CREATE TABLE "DiscountProduct" (
  "discountId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  CONSTRAINT "DiscountProduct_pkey" PRIMARY KEY ("discountId", "productId")
);

CREATE TABLE "DiscountCategory" (
  "discountId" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  CONSTRAINT "DiscountCategory_pkey" PRIMARY KEY ("discountId", "categoryId")
);

CREATE TABLE "DiscountCustomer" (
  "discountId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  CONSTRAINT "DiscountCustomer_pkey" PRIMARY KEY ("discountId", "customerId")
);

CREATE TABLE "DiscountRedemption" (
  "id" UUID NOT NULL,
  "discountId" UUID NOT NULL,
  "customerId" UUID,
  "orderReference" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscountRedemption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DiscountRedemption_amount_check" CHECK ("amount" >= 0)
);

CREATE UNIQUE INDEX "Discount_code_key" ON "Discount"("code");
CREATE INDEX "Discount_mode_isActive_priority_idx"
  ON "Discount"("mode", "isActive", "priority");
CREATE INDEX "Discount_startsAt_endsAt_idx" ON "Discount"("startsAt", "endsAt");
CREATE INDEX "DiscountProduct_productId_idx" ON "DiscountProduct"("productId");
CREATE INDEX "DiscountCategory_categoryId_idx" ON "DiscountCategory"("categoryId");
CREATE INDEX "DiscountCustomer_customerId_idx" ON "DiscountCustomer"("customerId");
CREATE INDEX "DiscountRedemption_customerId_discountId_idx"
  ON "DiscountRedemption"("customerId", "discountId");
CREATE INDEX "DiscountRedemption_orderReference_idx"
  ON "DiscountRedemption"("orderReference");
CREATE UNIQUE INDEX "DiscountRedemption_discountId_orderReference_key"
  ON "DiscountRedemption"("discountId", "orderReference");

ALTER TABLE "DiscountProduct"
  ADD CONSTRAINT "DiscountProduct_discountId_fkey"
  FOREIGN KEY ("discountId") REFERENCES "Discount"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscountProduct"
  ADD CONSTRAINT "DiscountProduct_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscountCategory"
  ADD CONSTRAINT "DiscountCategory_discountId_fkey"
  FOREIGN KEY ("discountId") REFERENCES "Discount"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscountCategory"
  ADD CONSTRAINT "DiscountCategory_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscountCustomer"
  ADD CONSTRAINT "DiscountCustomer_discountId_fkey"
  FOREIGN KEY ("discountId") REFERENCES "Discount"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscountCustomer"
  ADD CONSTRAINT "DiscountCustomer_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscountRedemption"
  ADD CONSTRAINT "DiscountRedemption_discountId_fkey"
  FOREIGN KEY ("discountId") REFERENCES "Discount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DiscountRedemption"
  ADD CONSTRAINT "DiscountRedemption_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
