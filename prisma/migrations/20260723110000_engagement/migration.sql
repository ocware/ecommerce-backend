CREATE TYPE "ProductReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "CustomerNotificationType" AS ENUM (
  'ORDER_PLACED',
  'ORDER_STATUS',
  'BACK_IN_STOCK',
  'ACCOUNT'
);

CREATE TABLE "ProductReview" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "rating" INTEGER NOT NULL,
  "title" TEXT,
  "body" TEXT NOT NULL,
  "status" "ProductReviewStatus" NOT NULL DEFAULT 'PENDING',
  "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
  "moderatedByStaffId" UUID,
  "moderatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductReview_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "ProductReview_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductReview_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "WishlistItem" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WishlistItem_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WishlistItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BackInStockSubscription" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BackInStockSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BackInStockSubscription_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BackInStockSubscription_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CustomerNotification" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "type" "CustomerNotificationType" NOT NULL,
  "eventName" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "href" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerNotification_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProductReview_productId_customerId_key"
  ON "ProductReview"("productId", "customerId");
CREATE INDEX "ProductReview_productId_status_createdAt_idx"
  ON "ProductReview"("productId", "status", "createdAt");
CREATE INDEX "ProductReview_status_createdAt_idx"
  ON "ProductReview"("status", "createdAt");
CREATE INDEX "ProductReview_customerId_createdAt_idx"
  ON "ProductReview"("customerId", "createdAt");

CREATE UNIQUE INDEX "WishlistItem_customerId_productId_key"
  ON "WishlistItem"("customerId", "productId");
CREATE INDEX "WishlistItem_customerId_createdAt_idx"
  ON "WishlistItem"("customerId", "createdAt");
CREATE INDEX "WishlistItem_productId_idx" ON "WishlistItem"("productId");

CREATE UNIQUE INDEX "BackInStockSubscription_customerId_variantId_key"
  ON "BackInStockSubscription"("customerId", "variantId");
CREATE INDEX "BackInStockSubscription_variantId_isActive_idx"
  ON "BackInStockSubscription"("variantId", "isActive");
CREATE INDEX "BackInStockSubscription_customerId_createdAt_idx"
  ON "BackInStockSubscription"("customerId", "createdAt");

CREATE UNIQUE INDEX "CustomerNotification_customerId_eventName_eventId_key"
  ON "CustomerNotification"("customerId", "eventName", "eventId");
CREATE INDEX "CustomerNotification_customerId_readAt_createdAt_idx"
  ON "CustomerNotification"("customerId", "readAt", "createdAt");
