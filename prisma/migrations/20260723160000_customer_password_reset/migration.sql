CREATE TABLE "CustomerPasswordResetToken" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "customerId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerPasswordResetToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerPasswordResetToken_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CustomerPasswordResetToken_tokenHash_key"
  ON "CustomerPasswordResetToken"("tokenHash");
CREATE INDEX "CustomerPasswordResetToken_customerId_createdAt_idx"
  ON "CustomerPasswordResetToken"("customerId", "createdAt");
CREATE INDEX "CustomerPasswordResetToken_expiresAt_idx"
  ON "CustomerPasswordResetToken"("expiresAt");
