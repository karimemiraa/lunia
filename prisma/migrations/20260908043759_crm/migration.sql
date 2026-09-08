-- CreateTable
CREATE TABLE "VisitNote" (
    "id" TEXT NOT NULL,
    "clientProfileId" TEXT NOT NULL,
    "bookingId" TEXT,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignSpend" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "periodMonth" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignSpend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageView" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "locale" TEXT,
    "referrerHost" TEXT,
    "source" TEXT,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT,
    "sessionId" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisitNote_clientProfileId_idx" ON "VisitNote"("clientProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignSpend_channel_periodMonth_key" ON "CampaignSpend"("channel", "periodMonth");

-- CreateIndex
CREATE INDEX "PageView_createdAt_idx" ON "PageView"("createdAt");

-- CreateIndex
CREATE INDEX "PageView_path_idx" ON "PageView"("path");

-- CreateIndex
CREATE INDEX "PageView_source_idx" ON "PageView"("source");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_createdAt_idx" ON "AnalyticsEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_name_idx" ON "AnalyticsEvent"("name");

-- CreateIndex
CREATE INDEX "Booking_createdAt_idx" ON "Booking"("createdAt");

-- AddForeignKey
ALTER TABLE "VisitNote" ADD CONSTRAINT "VisitNote_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
