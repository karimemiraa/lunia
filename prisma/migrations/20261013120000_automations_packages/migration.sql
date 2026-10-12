
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MsgKind" ADD VALUE 'PACKAGE_EXPIRING';
ALTER TYPE "MsgKind" ADD VALUE 'WIN_BACK';

-- AlterTable
ALTER TABLE "PackagePurchase" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "expiryReminderAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ServicePackage" ADD COLUMN     "validityDays" INTEGER;

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "runKey" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN,
    "summary" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobRun_job_startedAt_idx" ON "JobRun"("job", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobRun_job_runKey_key" ON "JobRun"("job", "runKey");

