-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('LEAD', 'ATTEMPTED', 'CONTACTED', 'FOLLOW_UP', 'BOOKED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "LeadDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- AlterTable
ALTER TABLE "ClientProfile" ADD COLUMN     "direction" "LeadDirection",
ADD COLUMN     "nextFollowUpAt" TIMESTAMP(3),
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "stage" "LeadStage" NOT NULL DEFAULT 'LEAD';

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "clientProfileId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "outcome" TEXT,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadActivity_clientProfileId_idx" ON "LeadActivity"("clientProfileId");

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
