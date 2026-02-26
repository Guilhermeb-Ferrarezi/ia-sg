-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#06b6d4',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Contact"
  ADD COLUMN "stageId" INTEGER,
  ADD COLUMN "leadStatus" TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN "source" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "botEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "lastInteractionAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Task" (
    "id" SERIAL NOT NULL,
    "contactId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStage_name_key" ON "PipelineStage"("name");
CREATE UNIQUE INDEX "PipelineStage_position_key" ON "PipelineStage"("position");
CREATE INDEX "Contact_stageId_idx" ON "Contact"("stageId");
CREATE INDEX "Contact_leadStatus_idx" ON "Contact"("leadStatus");
CREATE INDEX "Contact_lastInteractionAt_idx" ON "Contact"("lastInteractionAt");
CREATE INDEX "Task_contactId_status_idx" ON "Task"("contactId", "status");
CREATE INDEX "Task_dueAt_status_idx" ON "Task"("dueAt", "status");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default stages
INSERT INTO "PipelineStage" ("name", "position", "color", "isActive", "createdAt", "updatedAt") VALUES
('Novo', 1, '#38bdf8', true, NOW(), NOW()),
('Qualificado', 2, '#22c55e', true, NOW(), NOW()),
('Proposta', 3, '#f59e0b', true, NOW(), NOW()),
('Negociação', 4, '#f97316', true, NOW(), NOW()),
('Fechado (ganho)', 5, '#10b981', true, NOW(), NOW()),
('Fechado (perdido)', 6, '#ef4444', true, NOW(), NOW())
ON CONFLICT ("name") DO NOTHING;
