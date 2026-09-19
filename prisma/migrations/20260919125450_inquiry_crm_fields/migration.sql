-- AlterTable
ALTER TABLE "ContactInquiry" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "clientProfileId" TEXT,
ADD COLUMN     "repliedAt" TIMESTAMP(3),
ADD COLUMN     "replyBody" TEXT;
