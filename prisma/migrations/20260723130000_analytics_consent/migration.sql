CREATE TYPE "ConsentSource" AS ENUM ('COOKIE_BANNER', 'ACCOUNT', 'CHECKOUT', 'ADMIN');
CREATE TYPE "AnalyticsEventName" AS ENUM (
  'PAGE_VIEW',
  'VIEW_ITEM',
  'ADD_TO_CART',
  'BEGIN_CHECKOUT',
  'PURCHASE',
  'SEARCH',
  'SIGN_UP',
  'LOGIN'
);

CREATE TABLE "ConsentRecord" (
  "id" UUID NOT NULL,
  "customerId" UUID,
  "anonymousId" TEXT NOT NULL,
  "analyticsGranted" BOOLEAN NOT NULL,
  "marketingGranted" BOOLEAN NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "source" "ConsentSource" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsentRecord_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "AnalyticsEvent" (
  "id" UUID NOT NULL,
  "customerId" UUID,
  "consentRecordId" UUID,
  "anonymousId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "name" "AnalyticsEventName" NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AnalyticsEvent_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AnalyticsEvent_consentRecordId_fkey"
    FOREIGN KEY ("consentRecordId") REFERENCES "ConsentRecord"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ConsentRecord_anonymousId_createdAt_idx"
  ON "ConsentRecord"("anonymousId", "createdAt");
CREATE INDEX "ConsentRecord_customerId_createdAt_idx"
  ON "ConsentRecord"("customerId", "createdAt");
CREATE UNIQUE INDEX "AnalyticsEvent_dedupeKey_key" ON "AnalyticsEvent"("dedupeKey");
CREATE INDEX "AnalyticsEvent_name_occurredAt_idx"
  ON "AnalyticsEvent"("name", "occurredAt");
CREATE INDEX "AnalyticsEvent_anonymousId_occurredAt_idx"
  ON "AnalyticsEvent"("anonymousId", "occurredAt");
CREATE INDEX "AnalyticsEvent_customerId_occurredAt_idx"
  ON "AnalyticsEvent"("customerId", "occurredAt");
