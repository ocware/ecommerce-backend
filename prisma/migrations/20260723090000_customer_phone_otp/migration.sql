DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Customer"
    WHERE "phone" IS NOT NULL
    GROUP BY "phone"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce unique customer phones: duplicate phone values exist';
  END IF;
END $$;

DROP INDEX IF EXISTS "Customer_phone_idx";
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

CREATE TABLE "CustomerOtpChallenge" (
  "id" UUID NOT NULL,
  "customerId" UUID,
  "phone" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "registrationTokenHash" TEXT,
  "registrationExpiresAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerOtpChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerOtpChallenge_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "CustomerOtpChallenge_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CustomerOtpChallenge_registrationTokenHash_key"
  ON "CustomerOtpChallenge"("registrationTokenHash");
CREATE INDEX "CustomerOtpChallenge_phone_requestedAt_idx"
  ON "CustomerOtpChallenge"("phone", "requestedAt");
CREATE INDEX "CustomerOtpChallenge_expiresAt_idx"
  ON "CustomerOtpChallenge"("expiresAt");
