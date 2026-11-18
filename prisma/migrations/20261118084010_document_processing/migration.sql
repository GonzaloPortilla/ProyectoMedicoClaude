-- CreateEnum
CREATE TYPE "DocumentProcessingStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'READY_FOR_REVIEW', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExtractionMethod" AS ENUM ('PDF_TEXT', 'OCR', 'MANUAL');

-- CreateEnum
CREATE TYPE "MeasurementReviewStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DISCARDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_PROCESSED';
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_REVIEWED';
ALTER TYPE "AuditAction" ADD VALUE 'MEASUREMENTS_REVIEWED';
ALTER TYPE "AuditAction" ADD VALUE 'MEASUREMENTS_VIEWED';

-- AlterTable
ALTER TABLE "medical_files" ADD COLUMN     "originalSha256" TEXT;

-- CreateTable
CREATE TABLE "document_extractions" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "status" "DocumentProcessingStatus" NOT NULL DEFAULT 'UPLOADED',
    "method" "ExtractionMethod",
    "provider" TEXT,
    "text" TEXT,
    "pageCount" INTEGER,
    "ocrConfidence" DOUBLE PRECISION,
    "suggestions" JSONB,
    "metadataReviewed" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_concepts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultUnit" TEXT,
    "loincCode" TEXT,
    "snomedCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "measurement_concepts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_measurements" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fileId" TEXT,
    "extractionId" TEXT,
    "conceptId" TEXT,
    "originalName" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "valueText" TEXT NOT NULL,
    "valueNumeric" DECIMAL(18,6),
    "unit" TEXT,
    "refLow" DECIMAL(18,6),
    "refHigh" DECIMAL(18,6),
    "refText" TEXT,
    "documentFlag" TEXT,
    "measuredOn" DATE NOT NULL,
    "institutionId" TEXT,
    "extractionMethod" "ExtractionMethod" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "reviewStatus" "MeasurementReviewStatus" NOT NULL DEFAULT 'PENDING',
    "detected" JSONB,
    "editedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "source" "DataSource" NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_extractions_fileId_key" ON "document_extractions"("fileId");

-- CreateIndex
CREATE INDEX "document_extractions_patientId_status_idx" ON "document_extractions"("patientId", "status");

-- CreateIndex
CREATE INDEX "document_extractions_recordId_idx" ON "document_extractions"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_concepts_code_key" ON "measurement_concepts"("code");

-- CreateIndex
CREATE INDEX "medical_measurements_patientId_normalizedKey_measuredOn_idx" ON "medical_measurements"("patientId", "normalizedKey", "measuredOn");

-- CreateIndex
CREATE INDEX "medical_measurements_patientId_reviewStatus_idx" ON "medical_measurements"("patientId", "reviewStatus");

-- CreateIndex
CREATE INDEX "medical_measurements_recordId_idx" ON "medical_measurements"("recordId");

-- CreateIndex
CREATE INDEX "medical_files_patientId_originalSha256_idx" ON "medical_files"("patientId", "originalSha256");

-- CreateIndex
CREATE INDEX "medical_files_patientId_sha256_idx" ON "medical_files"("patientId", "sha256");

-- AddForeignKey
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "medical_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "medical_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_measurements" ADD CONSTRAINT "medical_measurements_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_measurements" ADD CONSTRAINT "medical_measurements_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "medical_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_measurements" ADD CONSTRAINT "medical_measurements_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "medical_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_measurements" ADD CONSTRAINT "medical_measurements_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "document_extractions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_measurements" ADD CONSTRAINT "medical_measurements_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "measurement_concepts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_measurements" ADD CONSTRAINT "medical_measurements_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_measurements" ADD CONSTRAINT "medical_measurements_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_measurements" ADD CONSTRAINT "medical_measurements_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Datos existentes ───────────────────────────────────────────────────────
-- Para los archivos previos, el hash almacenado es la mejor referencia disponible.
UPDATE "medical_files" SET "originalSha256" = "sha256" WHERE "originalSha256" IS NULL;

-- ─── El documento original es inmutable ─────────────────────────────────────
-- Una vez guardado, el contenido de un archivo (clave en el storage, hash, tamaño y tipo)
-- no se puede cambiar. Sólo se permite anular la referencia al usuario (ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION medical_files_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW."storageKey" IS DISTINCT FROM OLD."storageKey"
     OR NEW."sha256" IS DISTINCT FROM OLD."sha256"
     OR NEW."originalSha256" IS DISTINCT FROM OLD."originalSha256"
     OR NEW."sizeBytes" IS DISTINCT FROM OLD."sizeBytes"
     OR NEW."mimeType" IS DISTINCT FROM OLD."mimeType"
     OR NEW."patientId" IS DISTINCT FROM OLD."patientId"
     OR NEW."recordId" IS DISTINCT FROM OLD."recordId" THEN
    RAISE EXCEPTION 'medical_files: el documento original no se puede modificar' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER medical_files_immutable BEFORE UPDATE ON "medical_files"
  FOR EACH ROW EXECUTE FUNCTION medical_files_immutable();

-- ─── Integridad entre pacientes ─────────────────────────────────────────────
-- Una extracción o medición siempre pertenece al mismo paciente que su registro.
CREATE OR REPLACE FUNCTION phase6_same_patient() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "medical_records" r WHERE r."id" = NEW."recordId" AND r."patientId" = NEW."patientId") THEN
    RAISE EXCEPTION '%: el registro no pertenece al paciente', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER document_extractions_same_patient BEFORE INSERT OR UPDATE OF "patientId", "recordId" ON "document_extractions"
  FOR EACH ROW EXECUTE FUNCTION phase6_same_patient();
CREATE TRIGGER medical_measurements_same_patient BEFORE INSERT OR UPDATE OF "patientId", "recordId" ON "medical_measurements"
  FOR EACH ROW EXECUTE FUNCTION phase6_same_patient();

-- ─── Catálogo inicial de conceptos (src/server/documents/analysis/concepts.ts) ──
INSERT INTO "measurement_concepts" ("id", "code", "displayName", "aliases", "defaultUnit") VALUES
  (gen_random_uuid()::text, 'glucose', 'Glucemia', ARRAY['glucemia', 'glucosa', 'glucose', 'glicemia', 'glucemia en ayunas', 'glucosa en ayunas', 'glucosa basal', 'glucemia basal', 'fasting glucose']::TEXT[], 'mg/dL'),
  (gen_random_uuid()::text, 'hba1c', 'Hemoglobina glicosilada (HbA1c)', ARRAY['hba1c', 'hemoglobina glicosilada', 'hemoglobina glicada', 'hemoglobina a1c', 'a1c', 'glycated hemoglobin']::TEXT[], '%'),
  (gen_random_uuid()::text, 'cholesterol_total', 'Colesterol total', ARRAY['colesterol total', 'colesterol', 'colesterolemia', 'cholesterol', 'total cholesterol']::TEXT[], 'mg/dL'),
  (gen_random_uuid()::text, 'cholesterol_hdl', 'Colesterol HDL', ARRAY['hdl', 'colesterol hdl', 'hdl colesterol', 'c hdl', 'hdl c', 'hdl cholesterol']::TEXT[], 'mg/dL'),
  (gen_random_uuid()::text, 'cholesterol_ldl', 'Colesterol LDL', ARRAY['ldl', 'colesterol ldl', 'ldl colesterol', 'c ldl', 'ldl c', 'ldl cholesterol']::TEXT[], 'mg/dL'),
  (gen_random_uuid()::text, 'triglycerides', 'Triglicéridos', ARRAY['trigliceridos', 'trigliceridemia', 'triglycerides', 'tg']::TEXT[], 'mg/dL'),
  (gen_random_uuid()::text, 'hemoglobin', 'Hemoglobina', ARRAY['hemoglobina', 'hemoglobin', 'hb', 'hgb']::TEXT[], 'g/dL'),
  (gen_random_uuid()::text, 'hematocrit', 'Hematocrito', ARRAY['hematocrito', 'hematocrit', 'hto', 'hct']::TEXT[], '%'),
  (gen_random_uuid()::text, 'rbc', 'Glóbulos rojos', ARRAY['globulos rojos', 'hematies', 'eritrocitos', 'recuento de globulos rojos', 'red blood cells', 'rbc']::TEXT[], NULL),
  (gen_random_uuid()::text, 'wbc', 'Glóbulos blancos', ARRAY['globulos blancos', 'leucocitos', 'recuento de globulos blancos', 'recuento de leucocitos', 'white blood cells', 'wbc']::TEXT[], NULL),
  (gen_random_uuid()::text, 'platelets', 'Plaquetas', ARRAY['plaquetas', 'recuento de plaquetas', 'platelets', 'plt']::TEXT[], NULL),
  (gen_random_uuid()::text, 'creatinine', 'Creatinina', ARRAY['creatinina', 'creatininemia', 'creatinina serica', 'creatinine']::TEXT[], 'mg/dL'),
  (gen_random_uuid()::text, 'urea', 'Urea', ARRAY['urea', 'uremia', 'urea serica']::TEXT[], 'mg/dL'),
  (gen_random_uuid()::text, 'uric_acid', 'Ácido úrico', ARRAY['acido urico', 'uricemia', 'uric acid']::TEXT[], 'mg/dL'),
  (gen_random_uuid()::text, 'tsh', 'TSH', ARRAY['tsh', 'tirotrofina', 'hormona tiroestimulante', 'tsh ultrasensible']::TEXT[], NULL),
  (gen_random_uuid()::text, 't4_free', 'T4 libre', ARRAY['t4 libre', 't4l', 'free t4', 'tiroxina libre', 'ft4']::TEXT[], NULL),
  (gen_random_uuid()::text, 'ast', 'GOT / AST', ARRAY['got', 'ast', 'tgo', 'got ast', 'aspartato aminotransferasa', 'transaminasa oxalacetica']::TEXT[], 'U/L'),
  (gen_random_uuid()::text, 'alt', 'GPT / ALT', ARRAY['gpt', 'alt', 'tgp', 'gpt alt', 'alanina aminotransferasa', 'transaminasa piruvica']::TEXT[], 'U/L'),
  (gen_random_uuid()::text, 'gamma_gt', 'Gamma GT', ARRAY['gamma gt', 'ggt', 'gamma glutamil transferasa', 'gamma glutamiltranspeptidasa']::TEXT[], 'U/L'),
  (gen_random_uuid()::text, 'alp', 'Fosfatasa alcalina', ARRAY['fosfatasa alcalina', 'fal', 'alp', 'alkaline phosphatase']::TEXT[], 'U/L'),
  (gen_random_uuid()::text, 'bilirubin_total', 'Bilirrubina total', ARRAY['bilirrubina total', 'bilirrubina', 'total bilirubin']::TEXT[], 'mg/dL'),
  (gen_random_uuid()::text, 'sodium', 'Sodio', ARRAY['sodio', 'natremia', 'sodium', 'na']::TEXT[], 'mEq/L'),
  (gen_random_uuid()::text, 'potassium', 'Potasio', ARRAY['potasio', 'kalemia', 'potassium', 'k']::TEXT[], 'mEq/L'),
  (gen_random_uuid()::text, 'iron', 'Hierro', ARRAY['hierro', 'hierro serico', 'ferremia', 'sideremia', 'iron']::TEXT[], NULL),
  (gen_random_uuid()::text, 'ferritin', 'Ferritina', ARRAY['ferritina', 'ferritin']::TEXT[], 'ng/mL'),
  (gen_random_uuid()::text, 'vitamin_d', 'Vitamina D (25-OH)', ARRAY['vitamina d', '25 oh vitamina d', 'vitamina d 25 oh', '25 hidroxivitamina d', 'vitamin d']::TEXT[], 'ng/mL'),
  (gen_random_uuid()::text, 'vitamin_b12', 'Vitamina B12', ARRAY['vitamina b12', 'b12', 'cianocobalamina', 'vitamin b12']::TEXT[], 'pg/mL'),
  (gen_random_uuid()::text, 'psa', 'PSA total', ARRAY['psa', 'psa total', 'antigeno prostatico especifico']::TEXT[], 'ng/mL'),
  (gen_random_uuid()::text, 'crp', 'Proteína C reactiva', ARRAY['proteina c reactiva', 'pcr', 'crp', 'pcr ultrasensible']::TEXT[], 'mg/L'),
  (gen_random_uuid()::text, 'esr', 'Eritrosedimentación', ARRAY['eritrosedimentacion', 'vsg', 'eritro', 'velocidad de sedimentacion', 'esr']::TEXT[], 'mm/h')
ON CONFLICT ("code") DO NOTHING;
