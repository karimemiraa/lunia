-- CreateTable
CREATE TABLE "CommunicationLog" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "toPhone" TEXT NOT NULL,
    "bookingId" TEXT,
    "status" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunicationLog_toPhone_idx" ON "CommunicationLog"("toPhone");

-- CreateIndex
CREATE INDEX "CommunicationLog_bookingId_idx" ON "CommunicationLog"("bookingId");
