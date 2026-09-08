-- AlterEnum
ALTER TYPE "MsgStatus" ADD VALUE 'SENDING';

-- AlterTable
ALTER TABLE "ScheduledMessage" ADD COLUMN     "claimId" TEXT,
ADD COLUMN     "claimedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ScheduledMessage_claimId_idx" ON "ScheduledMessage"("claimId");

-- CreateIndex
CREATE INDEX "ScheduledMessage_status_claimedAt_idx" ON "ScheduledMessage"("status", "claimedAt");
