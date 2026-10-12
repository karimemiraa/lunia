-- CreateTable
CREATE TABLE "EditRequest" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "pagePath" TEXT,
    "title" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EditRequest_status_createdAt_idx" ON "EditRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EditRequest_createdById_createdAt_idx" ON "EditRequest"("createdById", "createdAt");

