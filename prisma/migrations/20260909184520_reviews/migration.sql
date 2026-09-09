-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "MsgKind" ADD VALUE 'REVIEW_REQUEST';

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "clientProfileId" TEXT,
    "bookingId" TEXT,
    "serviceId" TEXT,
    "rating" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "body" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "authorDisplayName" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "consentPublic" BOOLEAN NOT NULL DEFAULT false,
    "token" TEXT NOT NULL,
    "tokenUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Review_bookingId_key" ON "Review"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_token_key" ON "Review"("token");

-- CreateIndex
CREATE INDEX "Review_status_idx" ON "Review"("status");

-- CreateIndex
CREATE INDEX "Review_serviceId_idx" ON "Review"("serviceId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "ClientProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
