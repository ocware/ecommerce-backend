CREATE TYPE "StaffRole" AS ENUM (
  'OWNER',
  'ADMIN',
  'PRODUCT_MANAGER',
  'ORDER_MANAGER',
  'SUPPORT',
  'WAREHOUSE_STAFF'
);

CREATE TYPE "StaffStatus" AS ENUM (
  'ACTIVE',
  'INVITED',
  'SUSPENDED',
  'DISABLED'
);

CREATE TYPE "StaffSessionStatus" AS ENUM (
  'ACTIVE',
  'REVOKED',
  'EXPIRED'
);

CREATE TABLE "StaffUser" (
  "id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "StaffRole" NOT NULL,
  "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffSession" (
  "id" UUID NOT NULL,
  "staffUserId" UUID NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "status" "StaffSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasswordResetToken" (
  "id" UUID NOT NULL,
  "staffUserId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL,
  "staffUserId" UUID,
  "action" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");
CREATE INDEX "StaffUser_role_idx" ON "StaffUser"("role");
CREATE INDEX "StaffUser_status_idx" ON "StaffUser"("status");

CREATE UNIQUE INDEX "StaffSession_refreshTokenHash_key" ON "StaffSession"("refreshTokenHash");
CREATE INDEX "StaffSession_staffUserId_idx" ON "StaffSession"("staffUserId");
CREATE INDEX "StaffSession_status_idx" ON "StaffSession"("status");
CREATE INDEX "StaffSession_expiresAt_idx" ON "StaffSession"("expiresAt");

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_staffUserId_idx" ON "PasswordResetToken"("staffUserId");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

CREATE INDEX "AuditLog_staffUserId_idx" ON "AuditLog"("staffUserId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

ALTER TABLE "StaffSession"
  ADD CONSTRAINT "StaffSession_staffUserId_fkey"
  FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PasswordResetToken"
  ADD CONSTRAINT "PasswordResetToken_staffUserId_fkey"
  FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_staffUserId_fkey"
  FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
