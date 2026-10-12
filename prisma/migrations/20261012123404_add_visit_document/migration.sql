-- CreateTable
CREATE TABLE "VisitDocument" (
    "id" TEXT NOT NULL,
    "clientProfileId" TEXT NOT NULL,
    "bookingId" TEXT,
    "appointmentId" TEXT,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "note" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisitDocument_clientProfileId_idx" ON "VisitDocument"("clientProfileId");

-- CreateIndex
CREATE INDEX "VisitDocument_bookingId_idx" ON "VisitDocument"("bookingId");

-- AddForeignKey
ALTER TABLE "VisitDocument" ADD CONSTRAINT "VisitDocument_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
