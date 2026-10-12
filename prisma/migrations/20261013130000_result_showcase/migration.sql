-- CreateTable
CREATE TABLE "ResultShowcase" (
    "id" TEXT NOT NULL,
    "beforePhotoId" TEXT NOT NULL,
    "afterPhotoId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "captionEn" TEXT NOT NULL DEFAULT '',
    "captionAr" TEXT NOT NULL DEFAULT '',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultShowcase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResultShowcase_isPublished_publishedAt_idx" ON "ResultShowcase"("isPublished", "publishedAt");

-- AddForeignKey
ALTER TABLE "ResultShowcase" ADD CONSTRAINT "ResultShowcase_beforePhotoId_fkey" FOREIGN KEY ("beforePhotoId") REFERENCES "ClinicalPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultShowcase" ADD CONSTRAINT "ResultShowcase_afterPhotoId_fkey" FOREIGN KEY ("afterPhotoId") REFERENCES "ClinicalPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

