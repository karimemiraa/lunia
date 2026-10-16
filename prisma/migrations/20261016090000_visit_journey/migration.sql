-- CreateEnum
CREATE TYPE "VisitStage" AS ENUM ('WAITING', 'CONSULTATION', 'TREATMENT', 'CHECKOUT', 'DONE');

-- AlterTable
ALTER TABLE "CheckIn" ADD COLUMN     "checkedInById" TEXT,
ADD COLUMN     "checkedOutAt" TIMESTAMP(3),
ADD COLUMN     "checkedOutById" TEXT,
ADD COLUMN     "consultStartedAt" TIMESTAMP(3),
ADD COLUMN     "hospitalityAt" TIMESTAMP(3),
ADD COLUMN     "paymentOverrideById" TEXT,
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "receivedById" TEXT,
ADD COLUMN     "stage" "VisitStage" NOT NULL DEFAULT 'WAITING',
ADD COLUMN     "stageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "treatmentEndedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "preparingSince" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "needsConsultation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payBeforeTreatment" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "VisitEvent" (
    "id" TEXT NOT NULL,
    "checkInId" TEXT NOT NULL,
    "stage" "VisitStage" NOT NULL,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byUserId" TEXT,
    "note" TEXT,

    CONSTRAINT "VisitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisitEvent_checkInId_at_idx" ON "VisitEvent"("checkInId", "at");

-- CreateIndex
CREATE INDEX "CheckIn_stage_idx" ON "CheckIn"("stage");

-- AddForeignKey
ALTER TABLE "VisitEvent" ADD CONSTRAINT "VisitEvent_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "CheckIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing visits: derive the stage from what was already recorded.
UPDATE "CheckIn" c SET "stage" = 'DONE', "stageAt" = COALESCE(c."seatedAt", c."arrivedAt")
FROM "Booking" b WHERE b.id = c."bookingId" AND b.status IN ('COMPLETED', 'CANCELLED', 'NO_SHOW');
UPDATE "CheckIn" SET "stage" = 'TREATMENT', "stageAt" = "seatedAt" WHERE "stage" = 'WAITING' AND "seatedAt" IS NOT NULL;

-- Diagnostic services start with a consultation.
UPDATE "Service" SET "needsConsultation" = true WHERE slug LIKE '%diagnostic%';
