-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "providerTemplateName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_kind_locale_channel_key" ON "MessageTemplate"("kind", "locale", "channel");
