-- AlterTable
ALTER TABLE "CommunicationLog" ADD COLUMN     "toEmail" TEXT,
ALTER COLUMN "toPhone" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "CommunicationLog_toEmail_idx" ON "CommunicationLog"("toEmail");
