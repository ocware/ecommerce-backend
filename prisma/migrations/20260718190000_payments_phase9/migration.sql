-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('CREATED', 'PENDING', 'AUTHORIZED', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentTransactionKind" AS ENUM ('AUTHORIZATION', 'CHARGE', 'REFUND');

-- CreateEnum
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentCallbackStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentRefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "gateway" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "gatewayReference" TEXT,
    "redirectUrl" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" UUID NOT NULL,
    "paymentAttemptId" UUID NOT NULL,
    "kind" "PaymentTransactionKind" NOT NULL,
    "status" "PaymentTransactionStatus" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "gatewayReference" TEXT,
    "gatewayTransactionReference" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentCallback" (
    "id" UUID NOT NULL,
    "gateway" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "gatewayReference" TEXT,
    "status" "PaymentCallbackStatus" NOT NULL DEFAULT 'PROCESSING',
    "payload" JSONB NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentCallback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRefund" (
    "id" UUID NOT NULL,
    "paymentAttemptId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "requestedByStaffUserId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "PaymentRefundStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "reason" TEXT,
    "gatewayRefundReference" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "metadata" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_idempotencyKey_key" ON "PaymentAttempt"("idempotencyKey");
CREATE UNIQUE INDEX "PaymentAttempt_gateway_gatewayReference_key" ON "PaymentAttempt"("gateway", "gatewayReference");
CREATE INDEX "PaymentAttempt_orderId_createdAt_idx" ON "PaymentAttempt"("orderId", "createdAt");
CREATE INDEX "PaymentAttempt_status_createdAt_idx" ON "PaymentAttempt"("status", "createdAt");
CREATE UNIQUE INDEX "PaymentTransaction_idempotencyKey_key" ON "PaymentTransaction"("idempotencyKey");
CREATE INDEX "PaymentTransaction_paymentAttemptId_occurredAt_idx" ON "PaymentTransaction"("paymentAttemptId", "occurredAt");
CREATE INDEX "PaymentTransaction_gatewayTransactionReference_idx" ON "PaymentTransaction"("gatewayTransactionReference");
CREATE UNIQUE INDEX "PaymentCallback_gateway_externalEventId_key" ON "PaymentCallback"("gateway", "externalEventId");
CREATE INDEX "PaymentCallback_gatewayReference_idx" ON "PaymentCallback"("gatewayReference");
CREATE INDEX "PaymentCallback_status_createdAt_idx" ON "PaymentCallback"("status", "createdAt");
CREATE UNIQUE INDEX "PaymentRefund_idempotencyKey_key" ON "PaymentRefund"("idempotencyKey");
CREATE INDEX "PaymentRefund_paymentAttemptId_createdAt_idx" ON "PaymentRefund"("paymentAttemptId", "createdAt");
CREATE INDEX "PaymentRefund_orderId_createdAt_idx" ON "PaymentRefund"("orderId", "createdAt");
CREATE INDEX "PaymentRefund_status_createdAt_idx" ON "PaymentRefund"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_requestedByStaffUserId_fkey" FOREIGN KEY ("requestedByStaffUserId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
