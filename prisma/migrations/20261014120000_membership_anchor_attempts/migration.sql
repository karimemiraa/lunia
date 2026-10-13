-- AlterEnum
ALTER TYPE "GiftCardStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "remindersSent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MembershipSubscription" ADD COLUMN     "billingAnchorAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ScheduledMessage" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failedAt" TIMESTAMP(3);

