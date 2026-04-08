-- AlterTable
ALTER TABLE "AiConfig"
ADD COLUMN "strongModel" TEXT NOT NULL DEFAULT '',
ADD COLUMN "cheapModel" TEXT NOT NULL DEFAULT '',
ADD COLUMN "routingMode" TEXT NOT NULL DEFAULT 'automatic',
ADD COLUMN "taskOverrides" JSONB;
