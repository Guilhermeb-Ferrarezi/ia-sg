-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "email" TEXT,
ADD COLUMN     "interestConfidence" DOUBLE PRECISION,
ADD COLUMN     "lastLandingOfferId" INTEGER,
ADD COLUMN     "lastLandingPageId" INTEGER,
ADD COLUMN     "lastLandingSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Offer" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "aliases" JSONB,
    "durationLabel" TEXT,
    "modality" TEXT,
    "shortDescription" TEXT,
    "approvedFacts" JSONB,
    "ctaLabel" TEXT NOT NULL,
    "ctaUrl" TEXT NOT NULL,
    "visualTheme" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingPromptConfig" (
    "id" SERIAL NOT NULL,
    "scope" TEXT NOT NULL,
    "offerId" INTEGER,
    "systemPrompt" TEXT NOT NULL,
    "toneGuidelines" TEXT,
    "requiredRules" JSONB,
    "ctaRules" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingPromptConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingPage" (
    "id" SERIAL NOT NULL,
    "offerId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sectionsJson" JSONB NOT NULL,
    "promptSnapshot" JSONB,
    "sourceFactsSnapshot" JSONB,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingDelivery" (
    "id" SERIAL NOT NULL,
    "contactId" INTEGER NOT NULL,
    "offerId" INTEGER NOT NULL,
    "landingPageId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "deliveryChannel" TEXT NOT NULL DEFAULT 'whatsapp',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewedAt" TIMESTAMP(3),
    "lastClickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingEvent" (
    "id" SERIAL NOT NULL,
    "deliveryId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "requestMeta" JSONB,
    "userAgent" TEXT,
    "ip" TEXT,
    "referrer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Offer_slug_key" ON "Offer"("slug");

-- CreateIndex
CREATE INDEX "Offer_isActive_idx" ON "Offer"("isActive");

-- CreateIndex
CREATE INDEX "Offer_title_idx" ON "Offer"("title");

-- CreateIndex
CREATE INDEX "LandingPromptConfig_scope_active_idx" ON "LandingPromptConfig"("scope", "active");

-- CreateIndex
CREATE INDEX "LandingPromptConfig_offerId_active_idx" ON "LandingPromptConfig"("offerId", "active");

-- CreateIndex
CREATE INDEX "LandingPage_offerId_status_idx" ON "LandingPage"("offerId", "status");

-- CreateIndex
CREATE INDEX "LandingPage_publishedAt_idx" ON "LandingPage"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LandingPage_offerId_version_key" ON "LandingPage"("offerId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "LandingDelivery_token_key" ON "LandingDelivery"("token");

-- CreateIndex
CREATE INDEX "LandingDelivery_contactId_offerId_idx" ON "LandingDelivery"("contactId", "offerId");

-- CreateIndex
CREATE INDEX "LandingDelivery_offerId_sentAt_idx" ON "LandingDelivery"("offerId", "sentAt");

-- CreateIndex
CREATE INDEX "LandingDelivery_landingPageId_idx" ON "LandingDelivery"("landingPageId");

-- CreateIndex
CREATE INDEX "LandingEvent_deliveryId_eventType_idx" ON "LandingEvent"("deliveryId", "eventType");

-- CreateIndex
CREATE INDEX "LandingEvent_createdAt_idx" ON "LandingEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Contact_lastLandingOfferId_idx" ON "Contact"("lastLandingOfferId");

-- CreateIndex
CREATE INDEX "Contact_lastLandingPageId_idx" ON "Contact"("lastLandingPageId");

-- AddForeignKey
ALTER TABLE "LandingPromptConfig" ADD CONSTRAINT "LandingPromptConfig_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingPage" ADD CONSTRAINT "LandingPage_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingDelivery" ADD CONSTRAINT "LandingDelivery_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingDelivery" ADD CONSTRAINT "LandingDelivery_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingDelivery" ADD CONSTRAINT "LandingDelivery_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingEvent" ADD CONSTRAINT "LandingEvent_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "LandingDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

