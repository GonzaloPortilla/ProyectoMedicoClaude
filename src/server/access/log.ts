import "server-only";
import type { AccessLogAction } from "@/generated/prisma/enums";
import { db } from "@/server/db";

/** Registra un acceso o acción. Nunca debe impedir la operación principal si falla. */
export async function logAccess(entry: { patientId: string; actorUserId: string | null; grantId?: string | null; action: AccessLogAction; resourceId?: string | null }) {
  try {
    await db.accessLog.create({ data: { ...entry, grantId: entry.grantId ?? null, resourceId: entry.resourceId ?? null } });
  } catch (error) {
    console.error("[access-log] No se pudo registrar", entry.action, error);
  }
}
