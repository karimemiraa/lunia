-- CreateEnum
CREATE TYPE "CommsChannelPref" AS ENUM ('AUTO', 'WHATSAPP', 'SMS', 'EMAIL');

-- AlterEnum
ALTER TYPE "MsgStatus" ADD VALUE 'SKIPPED';

-- AlterTable
ALTER TABLE "ScheduledMessage" ADD COLUMN     "clientProfileId" TEXT;

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "clientProfileId" TEXT NOT NULL,
    "channel" "CommsChannelPref" NOT NULL DEFAULT 'AUTO',
    "remindersOptIn" BOOLEAN NOT NULL DEFAULT true,
    "postVisitOptIn" BOOLEAN NOT NULL DEFAULT true,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_clientProfileId_key" ON "NotificationPreference"("clientProfileId");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
