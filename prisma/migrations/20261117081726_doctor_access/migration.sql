-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccessGrantStatus" AS ENUM ('ACTIVE', 'REVOKED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AccessResourceType" AS ENUM ('HEALTH_SECTION', 'RECORD_CATEGORY');

-- CreateEnum
CREATE TYPE "AccessAction" AS ENUM ('VIEW', 'UPLOAD', 'CREATE_MEDICAL_ENTRY');

-- CreateEnum
CREATE TYPE "AccessLogAction" AS ENUM ('REQUEST_CREATED', 'GRANT_CREATED', 'GRANT_REVOKED', 'VIEW_PATIENT', 'VIEW_RECORD', 'VIEW_FILE', 'CREATE_REPORT', 'CORRECT_REPORT');

-- CreateTable
CREATE TABLE "patient_link_codes" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_requests" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorUserId" TEXT NOT NULL,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "requestedResources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_grants" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorUserId" TEXT NOT NULL,
    "requestId" TEXT,
    "status" "AccessGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_permissions" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "resourceType" "AccessResourceType" NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "action" "AccessAction" NOT NULL,

    CONSTRAINT "access_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_logs" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "grantId" TEXT,
    "action" "AccessLogAction" NOT NULL,
    "resourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_reports" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "licenseJurisdiction" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_report_versions" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "changeReason" TEXT,
    "contentSha256" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_report_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_link_codes_codeHash_key" ON "patient_link_codes"("codeHash");

-- CreateIndex
CREATE INDEX "patient_link_codes_patientId_idx" ON "patient_link_codes"("patientId");

-- CreateIndex
CREATE INDEX "access_requests_patientId_status_idx" ON "access_requests"("patientId", "status");

-- CreateIndex
CREATE INDEX "access_requests_doctorUserId_status_idx" ON "access_requests"("doctorUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "access_grants_requestId_key" ON "access_grants"("requestId");

-- CreateIndex
CREATE INDEX "access_grants_doctorUserId_status_idx" ON "access_grants"("doctorUserId", "status");

-- CreateIndex
CREATE INDEX "access_grants_patientId_status_idx" ON "access_grants"("patientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "access_permissions_grantId_resourceType_resourceKey_action_key" ON "access_permissions"("grantId", "resourceType", "resourceKey", "action");

-- CreateIndex
CREATE INDEX "access_logs_patientId_createdAt_idx" ON "access_logs"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "access_logs_grantId_idx" ON "access_logs"("grantId");

-- CreateIndex
CREATE UNIQUE INDEX "medical_reports_recordId_key" ON "medical_reports"("recordId");

-- CreateIndex
CREATE INDEX "medical_reports_patientId_idx" ON "medical_reports"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "medical_report_versions_reportId_version_key" ON "medical_report_versions"("reportId", "version");

-- AddForeignKey
ALTER TABLE "patient_link_codes" ADD CONSTRAINT "patient_link_codes_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_link_codes" ADD CONSTRAINT "patient_link_codes_usedByUserId_fkey" FOREIGN KEY ("usedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_doctorUserId_fkey" FOREIGN KEY ("doctorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_doctorUserId_fkey" FOREIGN KEY ("doctorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "access_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_permissions" ADD CONSTRAINT "access_permissions_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "access_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "access_grants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_reports" ADD CONSTRAINT "medical_reports_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "medical_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_reports" ADD CONSTRAINT "medical_reports_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_reports" ADD CONSTRAINT "medical_reports_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_report_versions" ADD CONSTRAINT "medical_report_versions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "medical_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_report_versions" ADD CONSTRAINT "medical_report_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Los informes médicos no pueden reemplazarse en silencio:
-- las versiones son append-only (se rechaza UPDATE y DELETE a nivel base de datos).
CREATE OR REPLACE FUNCTION prevent_report_version_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Las versiones de informes médicos son inmutables (operación % rechazada)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER medical_report_versions_immutable
  BEFORE UPDATE OR DELETE ON "medical_report_versions"
  FOR EACH ROW EXECUTE FUNCTION prevent_report_version_changes();

-- El registro de accesos tampoco se modifica.
CREATE OR REPLACE FUNCTION prevent_access_log_updates() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'El registro de accesos es inmutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER access_logs_immutable
  BEFORE UPDATE ON "access_logs"
  FOR EACH ROW EXECUTE FUNCTION prevent_access_log_updates();
