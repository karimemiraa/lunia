-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'NOTIFIED', 'CONVERTED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "MsgKind" ADD VALUE 'WAITLIST_OPEN';

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "clientProfileId" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "desiredDateISO" TEXT NOT NULL,
    "desiredWindow" TEXT,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaitlistEntry_serviceId_desiredDateISO_status_idx" ON "WaitlistEntry"("serviceId", "desiredDateISO", "status");

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
