-- CreateTable
CREATE TABLE "GiftCardOrder" (
    "id" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "purchaserName" TEXT NOT NULL,
    "purchaserEmail" TEXT NOT NULL,
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "giftCardId" TEXT,
    "paymentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCardOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GiftCardOrder_createdAt_idx" ON "GiftCardOrder"("createdAt");
