-- StaffSession: idle tracking + refresh reuse detection
ALTER TABLE "StaffSession" ADD COLUMN "familyId" UUID;
ALTER TABLE "StaffSession" ADD COLUMN "previousRefreshTokenHash" TEXT;
ALTER TABLE "StaffSession" ADD COLUMN "lastActiveAt" TIMESTAMP(3);

UPDATE "StaffSession"
SET
  "familyId" = "id",
  "lastActiveAt" = COALESCE("updatedAt", "createdAt")
WHERE "familyId" IS NULL;

ALTER TABLE "StaffSession" ALTER COLUMN "familyId" SET NOT NULL;
ALTER TABLE "StaffSession" ALTER COLUMN "familyId" SET DEFAULT gen_random_uuid();
ALTER TABLE "StaffSession" ALTER COLUMN "lastActiveAt" SET NOT NULL;
ALTER TABLE "StaffSession" ALTER COLUMN "lastActiveAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "StaffSession_previousRefreshTokenHash_key" ON "StaffSession"("previousRefreshTokenHash");
CREATE INDEX "StaffSession_familyId_idx" ON "StaffSession"("familyId");
CREATE INDEX "StaffSession_lastActiveAt_idx" ON "StaffSession"("lastActiveAt");

-- CustomerSession: idle tracking + refresh reuse detection
ALTER TABLE "CustomerSession" ADD COLUMN "familyId" UUID;
ALTER TABLE "CustomerSession" ADD COLUMN "previousRefreshTokenHash" TEXT;
ALTER TABLE "CustomerSession" ADD COLUMN "lastActiveAt" TIMESTAMP(3);

UPDATE "CustomerSession"
SET
  "familyId" = "id",
  "lastActiveAt" = COALESCE("updatedAt", "createdAt")
WHERE "familyId" IS NULL;

ALTER TABLE "CustomerSession" ALTER COLUMN "familyId" SET NOT NULL;
ALTER TABLE "CustomerSession" ALTER COLUMN "familyId" SET DEFAULT gen_random_uuid();
ALTER TABLE "CustomerSession" ALTER COLUMN "lastActiveAt" SET NOT NULL;
ALTER TABLE "CustomerSession" ALTER COLUMN "lastActiveAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "CustomerSession_previousRefreshTokenHash_key" ON "CustomerSession"("previousRefreshTokenHash");
CREATE INDEX "CustomerSession_familyId_idx" ON "CustomerSession"("familyId");
CREATE INDEX "CustomerSession_lastActiveAt_idx" ON "CustomerSession"("lastActiveAt");
