-- Drop legacy landing payload columns now that code bundles are the only source of truth.
ALTER TABLE "LandingCreationSession"
DROP COLUMN "builderDraftJson",
DROP COLUMN "previewSectionsJson";

ALTER TABLE "LandingPage"
DROP COLUMN "sectionsJson",
DROP COLUMN "builderDocumentJson";

ALTER TABLE "LandingPage"
ALTER COLUMN "landingCodeBundleJson" SET NOT NULL;
