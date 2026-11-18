-- La verificación de email pasa a ser obligatoria para ingresar.
-- Las cuentas creadas antes de esta versión se consideran verificadas para no bloquear a
-- sus dueños (en producción, alternativamente, se les puede pedir verificar en el próximo login).
UPDATE "users" SET "emailVerifiedAt" = COALESCE("lastLoginAt", "createdAt") WHERE "emailVerifiedAt" IS NULL;
