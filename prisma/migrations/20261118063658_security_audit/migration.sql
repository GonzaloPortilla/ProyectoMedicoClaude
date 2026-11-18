-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGIN_LOCKED', 'LOGOUT', 'SESSION_REVOKED', 'MFA_CHALLENGE_FAILED', 'MFA_ENABLED', 'MFA_DISABLED', 'MFA_RECOVERY_CODE_USED', 'PASSWORD_CHANGED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED', 'EMAIL_VERIFIED', 'ACCOUNT_REGISTERED', 'PROFILE_UPDATED', 'DATA_EXPORTED', 'RECORD_CREATED', 'RECORD_DELETED', 'RECORD_VIEWED', 'FILE_VIEWED', 'FILE_DOWNLOADED', 'HEALTH_ENTRY_CREATED', 'HEALTH_ENTRY_DELETED', 'EMERGENCY_SETTINGS_UPDATED', 'LINK_CODE_CREATED', 'ACCESS_REQUESTED', 'ACCESS_REQUEST_CANCELLED', 'ACCESS_GRANTED', 'ACCESS_REJECTED', 'ACCESS_REVOKED', 'ACCESS_EXPIRED', 'ACCESS_DENIED', 'PATIENT_SUMMARY_VIEWED', 'REPORT_CREATED', 'REPORT_CORRECTED', 'DOCTOR_VERIFICATION_DECIDED');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('PATIENT', 'DOCTOR', 'ADMIN', 'SYSTEM', 'ANONYMOUS');

-- AlterEnum
ALTER TYPE "AccessGrantStatus" ADD VALUE 'EXPIRED';

-- Las sesiones existentes se cierran: cambia el modelo de sesión (vencimiento por inactividad, MFA).
DELETE FROM "sessions";

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "mfaVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "mfaEnabledAt" TIMESTAMP(3),
ADD COLUMN     "mfaLastUsedStep" INTEGER,
ADD COLUMN     "mfaSecretEnc" TEXT,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);


-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" "AuditAction" NOT NULL,
    "outcome" "AuditOutcome" NOT NULL DEFAULT 'SUCCESS',
    "actorType" "AuditActorType" NOT NULL,
    "actorUserId" TEXT,
    "subjectPatientId" TEXT,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "grantId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "prevHash" TEXT,
    "hash" TEXT,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_recovery_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_seq_key" ON "audit_events"("seq");

-- CreateIndex
CREATE INDEX "audit_events_subjectPatientId_createdAt_idx" ON "audit_events"("subjectPatientId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_actorUserId_createdAt_idx" ON "audit_events"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_action_createdAt_idx" ON "audit_events"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_tokenHash_key" ON "email_verification_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_userId_idx" ON "email_verification_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_recovery_codes_codeHash_key" ON "mfa_recovery_codes"("codeHash");

-- CreateIndex
CREATE INDEX "mfa_recovery_codes_userId_idx" ON "mfa_recovery_codes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_publicId_key" ON "sessions"("publicId");

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoría: cadena de hashes + inmutabilidad
-- ─────────────────────────────────────────────────────────────────────────────

-- Representación canónica de una fila (la usan el trigger y la verificación).
CREATE OR REPLACE FUNCTION audit_event_canonical(e audit_events) RETURNS text AS $$
  SELECT concat_ws('|',
    e.id, e.seq::text, to_char(e."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS'),
    e.action::text, e.outcome::text, e."actorType"::text,
    coalesce(e."actorUserId", ''), coalesce(e."subjectPatientId", ''),
    coalesce(e."resourceType", ''), coalesce(e."resourceId", ''), coalesce(e."grantId", ''),
    coalesce(e.ip, ''), coalesce(e."userAgent", ''), coalesce(e.metadata::text, ''))
$$ LANGUAGE sql IMMUTABLE;

-- Encadena cada fila nueva con la anterior. El lock serializa las inserciones para que
-- el orden de `seq` y la cadena coincidan aun con requests concurrentes.
CREATE OR REPLACE FUNCTION audit_events_chain() RETURNS trigger AS $$
DECLARE
  previous text;
BEGIN
  PERFORM pg_advisory_xact_lock(4210001);
  NEW.seq := nextval(pg_get_serial_sequence('audit_events', 'seq'));
  SELECT hash INTO previous FROM audit_events ORDER BY seq DESC LIMIT 1;
  NEW."prevHash" := previous;
  NEW.hash := encode(sha256(convert_to(coalesce(previous, '') || '|' || audit_event_canonical(NEW), 'UTF8')), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_chain
  BEFORE INSERT ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION audit_events_chain();

-- Nada puede modificar ni borrar eventos.
CREATE OR REPLACE FUNCTION audit_events_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'El registro de auditoría es inmutable (operación % rechazada)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_no_update_delete
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION audit_events_immutable();

-- TRUNCATE sólo con una marca explícita de mantenimiento en la sesión de base de datos
-- (para entornos de desarrollo/test: SET app.audit_maintenance = 'on').
CREATE OR REPLACE FUNCTION audit_events_no_truncate() RETURNS trigger AS $$
BEGIN
  IF coalesce(current_setting('app.audit_maintenance', true), '') <> 'on' THEN
    RAISE EXCEPTION 'El registro de auditoría es inmutable (TRUNCATE rechazado)';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON "audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_no_truncate();

-- Verifica la cadena completa. Devuelve las filas inconsistentes (vacío = íntegra).
CREATE OR REPLACE FUNCTION audit_verify_chain()
RETURNS TABLE(event_id text, event_seq bigint, problem text) AS $$
DECLARE
  r audit_events;
  expected_prev text := NULL;
  first boolean := true;
BEGIN
  FOR r IN SELECT * FROM audit_events ORDER BY seq LOOP
    IF NOT first AND r."prevHash" IS DISTINCT FROM expected_prev THEN
      event_id := r.id; event_seq := r.seq; problem := 'prevHash no coincide (fila borrada o insertada fuera de la cadena)';
      RETURN NEXT;
    END IF;
    IF r.hash IS DISTINCT FROM encode(sha256(convert_to(coalesce(r."prevHash", '') || '|' || audit_event_canonical(r), 'UTF8')), 'hex') THEN
      event_id := r.id; event_seq := r.seq; problem := 'hash no coincide (fila modificada)';
      RETURN NEXT;
    END IF;
    expected_prev := r.hash;
    first := false;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migración del registro de accesos de la Fase 3 al nuevo registro de auditoría
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "audit_events" ("id", "createdAt", "action", "outcome", "actorType", "actorUserId", "subjectPatientId", "resourceType", "resourceId", "grantId", "metadata")
SELECT
  l."id",
  l."createdAt",
  (CASE l."action"::text
    WHEN 'REQUEST_CREATED' THEN 'ACCESS_REQUESTED'
    WHEN 'GRANT_CREATED' THEN 'ACCESS_GRANTED'
    WHEN 'GRANT_REVOKED' THEN 'ACCESS_REVOKED'
    WHEN 'VIEW_PATIENT' THEN 'PATIENT_SUMMARY_VIEWED'
    WHEN 'VIEW_RECORD' THEN 'RECORD_VIEWED'
    WHEN 'VIEW_FILE' THEN 'FILE_VIEWED'
    WHEN 'CREATE_REPORT' THEN 'REPORT_CREATED'
    WHEN 'CORRECT_REPORT' THEN 'REPORT_CORRECTED'
  END)::"AuditAction",
  'SUCCESS',
  (CASE WHEN l."action"::text IN ('GRANT_CREATED', 'GRANT_REVOKED') THEN 'PATIENT' ELSE 'DOCTOR' END)::"AuditActorType",
  l."actorUserId",
  l."patientId",
  (CASE l."action"::text
    WHEN 'REQUEST_CREATED' THEN 'ACCESS_REQUEST'
    WHEN 'VIEW_RECORD' THEN 'MEDICAL_RECORD'
    WHEN 'VIEW_FILE' THEN 'MEDICAL_FILE'
    WHEN 'CREATE_REPORT' THEN 'MEDICAL_REPORT'
    WHEN 'CORRECT_REPORT' THEN 'MEDICAL_REPORT'
    WHEN 'VIEW_PATIENT' THEN 'PATIENT'
    ELSE 'ACCESS_GRANT'
  END),
  l."resourceId",
  l."grantId",
  '{"migratedFrom": "access_logs"}'::jsonb
FROM "access_logs" l
ORDER BY l."createdAt", l."id";

DROP TABLE "access_logs";
DROP TYPE "AccessLogAction";
DROP FUNCTION IF EXISTS prevent_access_log_updates();
