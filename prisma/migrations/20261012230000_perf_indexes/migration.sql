-- Performance indexes for the admin's hot queries (Today page, calendar,
-- customer roster/360, communication log, notification feed).

-- CreateIndex
CREATE INDEX "Appointment_bookingId_idx" ON "Appointment"("bookingId");

-- CreateIndex
CREATE INDEX "Appointment_startAt_idx" ON "Appointment"("startAt");

-- CreateIndex
CREATE INDEX "Booking_clientProfileId_createdAt_idx" ON "Booking"("clientProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "ClientProfile_createdAt_idx" ON "ClientProfile"("createdAt");

-- CreateIndex
CREATE INDEX "CommunicationLog_createdAt_idx" ON "CommunicationLog"("createdAt");

-- CreateIndex
CREATE INDEX "CommunicationLog_kind_createdAt_idx" ON "CommunicationLog"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationLog_status_createdAt_idx" ON "CommunicationLog"("status", "createdAt");
