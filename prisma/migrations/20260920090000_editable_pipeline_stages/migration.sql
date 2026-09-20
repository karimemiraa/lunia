-- Editable CRM pipeline stages: replace the hardcoded LeadStage enum with a
-- PipelineStage table, remap existing ClientProfile.stage values to the new
-- treatment-center stage keys, and drop the enum.

-- 1. PipelineStage table
CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'open',
    "color" TEXT NOT NULL DEFAULT '#9ed5d0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PipelineStage_key_key" ON "PipelineStage"("key");
CREATE INDEX "PipelineStage_sortOrder_idx" ON "PipelineStage"("sortOrder");

-- 2. Seed the default treatment-center stages
INSERT INTO "PipelineStage" ("id","key","label","sortOrder","kind","color") VALUES
    ('stg_new','new','New enquiry',1,'open','#9ed5d0'),
    ('stg_contacted','contacted','Contacted',2,'open','#c0ad73'),
    ('stg_consultation','consultation','Consultation booked',3,'open','#93ccc6'),
    ('stg_active','active','Active client',4,'won','#283d3c'),
    ('stg_lost','lost','Lost',5,'lost','#d92d20')
ON CONFLICT ("key") DO NOTHING;

-- 3. Convert ClientProfile.stage from the LeadStage enum to text, remapping
--    the old stage names onto the new stage keys.
ALTER TABLE "ClientProfile" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "ClientProfile" ALTER COLUMN "stage" TYPE TEXT USING (
    CASE "stage"::text
        WHEN 'LEAD' THEN 'new'
        WHEN 'ATTEMPTED' THEN 'contacted'
        WHEN 'CONTACTED' THEN 'contacted'
        WHEN 'FOLLOW_UP' THEN 'contacted'
        WHEN 'BOOKED' THEN 'consultation'
        WHEN 'WON' THEN 'active'
        WHEN 'LOST' THEN 'lost'
        ELSE 'new'
    END
);
ALTER TABLE "ClientProfile" ALTER COLUMN "stage" SET DEFAULT 'new';

-- 4. Drop the now-unused enum type
DROP TYPE "LeadStage";
