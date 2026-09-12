-- AlterTable
ALTER TABLE "ScheduledMessage" ADD COLUMN     "toEmail" TEXT,
ALTER COLUMN "toPhone" DROP NOT NULL;
