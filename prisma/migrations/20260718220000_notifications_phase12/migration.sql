CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'ADMIN');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "Notification" (
  "id" UUID NOT NULL,
  "eventName" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "recipient" TEXT NOT NULL,
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "provider" TEXT,
  "providerMessageId" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "metadata" JSONB,
  "sentAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "readByStaffUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_eventName_eventId_channel_recipient_key"
  ON "Notification"("eventName", "eventId", "channel", "recipient");
CREATE INDEX "Notification_channel_status_createdAt_idx"
  ON "Notification"("channel", "status", "createdAt");
CREATE INDEX "Notification_recipient_createdAt_idx" ON "Notification"("recipient", "createdAt");
CREATE INDEX "Notification_readAt_createdAt_idx" ON "Notification"("readAt", "createdAt");
