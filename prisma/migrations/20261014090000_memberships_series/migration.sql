-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "seriesId" TEXT;

-- CreateTable
CREATE TABLE "BookingSeries" (
    "id" TEXT NOT NULL,
    "clientProfileId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "intervalWeeks" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "descriptionAr" TEXT NOT NULL DEFAULT '',
    "priceMinor" INTEGER NOT NULL,
    "serviceDiscountPct" INTEGER NOT NULL DEFAULT 0,
    "productDiscountPct" INTEGER NOT NULL DEFAULT 0,
    "includedSessions" INTEGER NOT NULL DEFAULT 0,
    "includedServiceId" TEXT,
    "sessionPackageId" TEXT,
    "minTermMonths" INTEGER NOT NULL DEFAULT 1,
    "graceDays" INTEGER NOT NULL DEFAULT 7,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipSubscription" (
    "id" TEXT NOT NULL,
    "clientProfileId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "minTermEndsAt" TIMESTAMP(3) NOT NULL,
    "cancelAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipCycle" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "invoiceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "paidAt" TIMESTAMP(3),
    "packagePurchaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipCycle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingSeries_clientProfileId_idx" ON "BookingSeries"("clientProfileId");

-- CreateIndex
CREATE INDEX "MembershipSubscription_clientProfileId_status_idx" ON "MembershipSubscription"("clientProfileId", "status");

-- CreateIndex
CREATE INDEX "MembershipSubscription_status_currentPeriodEnd_idx" ON "MembershipSubscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipCycle_invoiceId_key" ON "MembershipCycle"("invoiceId");

-- CreateIndex
CREATE INDEX "MembershipCycle_status_periodStart_idx" ON "MembershipCycle"("status", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipCycle_subscriptionId_periodStart_key" ON "MembershipCycle"("subscriptionId", "periodStart");

-- CreateIndex
CREATE INDEX "Booking_seriesId_idx" ON "Booking"("seriesId");

-- AddForeignKey
ALTER TABLE "MembershipSubscription" ADD CONSTRAINT "MembershipSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCycle" ADD CONSTRAINT "MembershipCycle_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "MembershipSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

