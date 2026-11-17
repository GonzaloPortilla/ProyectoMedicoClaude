-- Refina las protecciones de inmutabilidad: siguen rechazando cualquier cambio de contenido
-- y todo DELETE de versiones, pero permiten que ON DELETE SET NULL anule la referencia
-- al autor/actor si algún día se eliminara su usuario.

CREATE OR REPLACE FUNCTION prevent_report_version_changes() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las versiones de informes médicos son inmutables (DELETE rechazado)';
  END IF;
  IF NEW."createdById" IS NULL AND (to_jsonb(NEW) - 'createdById') = (to_jsonb(OLD) - 'createdById') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Las versiones de informes médicos son inmutables (UPDATE rechazado)';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_access_log_updates() RETURNS trigger AS $$
BEGIN
  IF (to_jsonb(NEW) - 'actorUserId' - 'grantId') = (to_jsonb(OLD) - 'actorUserId' - 'grantId')
     AND (NEW."actorUserId" IS NULL OR NEW."actorUserId" = OLD."actorUserId")
     AND (NEW."grantId" IS NULL OR NEW."grantId" = OLD."grantId") THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'El registro de accesos es inmutable';
END;
$$ LANGUAGE plpgsql;
