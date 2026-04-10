CREATE TABLE "LandingCreationReview" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "score" INTEGER,
    "summary" TEXT,
    "bundleGeneratedAt" TEXT,
    "issuesJson" JSONB,
    "snapshotsJson" JSONB,
    "consoleErrorsJson" JSONB,
    "metricsJson" JSONB,
    "reviewRound" INTEGER NOT NULL DEFAULT 1,
    "autoFixAttempted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingCreationReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LandingCreationReview_sessionId_createdAt_idx" ON "LandingCreationReview"("sessionId", "createdAt");
CREATE INDEX "LandingCreationReview_sessionId_reviewRound_idx" ON "LandingCreationReview"("sessionId", "reviewRound");

ALTER TABLE "LandingCreationReview"
ADD CONSTRAINT "LandingCreationReview_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "LandingCreationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
