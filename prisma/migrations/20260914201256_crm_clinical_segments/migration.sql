-- AlterTable
ALTER TABLE "ClientProfile" ADD COLUMN     "allergies" TEXT,
ADD COLUMN     "clinicalNotes" TEXT,
ADD COLUMN     "consentDataAt" TIMESTAMP(3),
ADD COLUMN     "consentTreatmentAt" TIMESTAMP(3),
ADD COLUMN     "skinConcerns" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "skinType" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filter" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);
