-- AlterTable
ALTER TABLE "EmployeeRecord" ADD COLUMN     "discountCapPct" INTEGER,
ADD COLUMN     "productCommissionBp" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "staffUserId" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "commissionBp" INTEGER;

-- CreateTable
CREATE TABLE "AppointmentDiscount" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "pctBp" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentDiscount_appointmentId_key" ON "AppointmentDiscount"("appointmentId");

-- CreateIndex
CREATE INDEX "AppointmentDiscount_status_idx" ON "AppointmentDiscount"("status");

-- AddForeignKey
ALTER TABLE "AppointmentDiscount" ADD CONSTRAINT "AppointmentDiscount_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill "performed / sold by" on existing invoice lines from the booking:
-- service lines go to the specialist who did that service, product lines on a
-- booking's invoice to the booking's (first) specialist.
UPDATE "InvoiceLine" l
SET "staffUserId" = a."staffUserId"
FROM "Invoice" i
JOIN "Appointment" a ON a."bookingId" = i."bookingId"
WHERE l."invoiceId" = i."id" AND l."serviceId" = a."serviceId" AND l."staffUserId" IS NULL;

UPDATE "InvoiceLine" l
SET "staffUserId" = (
  SELECT a."staffUserId" FROM "Appointment" a WHERE a."bookingId" = i."bookingId" ORDER BY a."startAt" ASC LIMIT 1
)
FROM "Invoice" i
WHERE l."invoiceId" = i."id" AND l."kind" = 'PRODUCT' AND l."staffUserId" IS NULL AND i."bookingId" IS NOT NULL;
