-- CreateTable
CREATE TABLE "LandingCreationSession" (
    "id" SERIAL NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "offerDraftJson" JSONB,
    "promptDraftJson" JSONB,
    "chatHistoryJson" JSONB,
    "previewSectionsJson" JSONB,
    "publishedOfferId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingCreationSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LandingCreationSession_status_updatedAt_idx" ON "LandingCreationSession"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "LandingCreationSession_publishedOfferId_idx" ON "LandingCreationSession"("publishedOfferId");

-- AddForeignKey
ALTER TABLE "LandingCreationSession" ADD CONSTRAINT "LandingCreationSession_publishedOfferId_fkey" FOREIGN KEY ("publishedOfferId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
