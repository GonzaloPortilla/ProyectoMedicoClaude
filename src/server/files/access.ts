import "server-only";
import { db } from "@/server/db";
import { hasRole } from "@/server/auth/roles";
import { validateSessionToken } from "@/server/auth/session";
import { canViewCategory } from "@/server/access/doctor-view";
import { getDoctorAccess } from "@/server/access/policy";
import { logAccess } from "@/server/access/log";
import type { Role } from "@/generated/prisma/enums";

export type FileRequester = { id: string; roles: readonly Role[] };

const fileSelect = { id: true, storageKey: true, originalName: true, mimeType: true, sizeBytes: true, recordId: true } as const;

/**
 * Única puerta de acceso a un archivo médico.
 *
 * 1. El paciente dueño puede leer sus archivos.
 * 2. Un médico puede leerlo sólo si tiene un acceso VIGENTE sobre ese paciente con permiso
 *    VIEW sobre la categoría del registro (y queda registrado en el log de accesos).
 * 3. Nadie más (incluido el administrador).
 *
 * Devuelve null tanto si el archivo no existe como si no hay permiso, para no revelar
 * qué identificadores existen.
 */
export async function findAccessibleFile(requester: FileRequester, fileId: string) {
  if (!fileId || fileId.length > 64) return null;

  if (hasRole(requester.roles, "PATIENT")) {
    const own = await db.medicalFile.findFirst({ where: { id: fileId, patient: { userId: requester.id } }, select: fileSelect });
    if (own) return own;
  }

  if (hasRole(requester.roles, "DOCTOR")) {
    const file = await db.medicalFile.findUnique({
      where: { id: fileId },
      select: { ...fileSelect, patientId: true, record: { select: { category: { select: { slug: true } } } } },
    });
    if (!file) return null;
    const access = await getDoctorAccess(requester.id, file.patientId);
    if (!access || !canViewCategory(access, file.record.category.slug)) return null;
    await logAccess({ patientId: file.patientId, actorUserId: requester.id, grantId: access.grantId, action: "VIEW_FILE", resourceId: file.id });
    return { id: file.id, storageKey: file.storageKey, originalName: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, recordId: file.recordId };
  }

  return null;
}

/** Igual que findAccessibleFile pero partiendo del token de sesión (cookie). */
export async function authorizeFileRequest(sessionToken: string | undefined, fileId: string) {
  if (!sessionToken) return { status: 401 as const, file: null };
  const session = await validateSessionToken(sessionToken);
  if (!session) return { status: 401 as const, file: null };
  const file = await findAccessibleFile(session.user, fileId);
  return file ? { status: 200 as const, file } : { status: 404 as const, file: null };
}
