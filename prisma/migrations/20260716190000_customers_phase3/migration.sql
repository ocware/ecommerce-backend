CREATE TYPE "CustomerStatus" AS ENUM (
  'ACTIVE',
  'GUEST',
  'SUSPENDED',
  'DISABLED'
);

CREATE TYPE "CustomerSessionStatus" AS ENUM (
  'ACTIVE',
  'REVOKED',
  'EXPIRED'
);

CREATE TYPE "AddressType" AS ENUM (
  'SHIPPING',
  'BILLING'
);

CREATE TABLE "Customer" (
  "id" UUID NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT,
  "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
  "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerSession" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "status" "CustomerSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerAddress" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "type" "AddressType" NOT NULL DEFAULT 'SHIPPING',
  "fullName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "province" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "line1" TEXT NOT NULL,
  "line2" TEXT,
  "postalCode" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerNote" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "staffUserId" UUID,
  "note" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestCheckoutProfile" (
  "id" UUID NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "name" TEXT NOT NULL,
  "metadata" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "customerId" UUID,

  CONSTRAINT "GuestCheckoutProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");
CREATE INDEX "Customer_status_idx" ON "Customer"("status");
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

CREATE UNIQUE INDEX "CustomerSession_refreshTokenHash_key" ON "CustomerSession"("refreshTokenHash");
CREATE INDEX "CustomerSession_customerId_idx" ON "CustomerSession"("customerId");
CREATE INDEX "CustomerSession_status_idx" ON "CustomerSession"("status");
CREATE INDEX "CustomerSession_expiresAt_idx" ON "CustomerSession"("expiresAt");

CREATE INDEX "CustomerAddress_customerId_idx" ON "CustomerAddress"("customerId");
CREATE INDEX "CustomerAddress_type_idx" ON "CustomerAddress"("type");

CREATE INDEX "CustomerNote_customerId_idx" ON "CustomerNote"("customerId");
CREATE INDEX "CustomerNote_staffUserId_idx" ON "CustomerNote"("staffUserId");

CREATE INDEX "GuestCheckoutProfile_email_idx" ON "GuestCheckoutProfile"("email");
CREATE INDEX "GuestCheckoutProfile_expiresAt_idx" ON "GuestCheckoutProfile"("expiresAt");

ALTER TABLE "CustomerSession"
  ADD CONSTRAINT "CustomerSession_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerAddress"
  ADD CONSTRAINT "CustomerAddress_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerNote"
  ADD CONSTRAINT "CustomerNote_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestCheckoutProfile"
  ADD CONSTRAINT "GuestCheckoutProfile_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
