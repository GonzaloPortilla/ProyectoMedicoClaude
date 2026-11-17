import "server-only";
import { db } from "@/server/db";
import { hasRole } from "@/server/auth/roles";
import { validateSessionToken } from "@/server/auth/session";
import type { Role } from "@/generated/prisma/enums";

export type FileRequester = { id: string; roles: readonly Role[] };

const fileSelect = { id: true, storageKey: true, originalName: true, mimeType: true, sizeBytes: true, recordId: true } as const;

/**
 * Única puerta de acceso a un archivo médico.
 *
 * Fase 2: sólo el paciente dueño puede leer sus archivos. Administradores y médicos
 * NO tienen acceso. En la próxima fase se agregará acá la regla
 * "médico con autorización vigente del paciente" (y su registro de acceso).
 *
 * Devuelve null tanto si el archivo no existe como si no hay permiso, para no revelar
 * qué identificadores existen.
 */
export async function findAccessibleFile(requester: FileRequester, fileId: string) {
  if (!fileId || fileId.length > 64) return null;
  if (!hasRole(requester.roles, "PATIENT")) return null;
  return db.medicalFile.findFirst({
    where: { id: fileId, patient: { userId: requester.id } },
    select: fileSelect,
  });
}

/** Igual que findAccessibleFile pero partiendo del token de sesión (cookie). */
export async function authorizeFileRequest(sessionToken: string | undefined, fileId: string) {
  if (!sessionToken) return { status: 401 as const, file: null };
  const session = await validateSessionToken(sessionToken);
  if (!session) return { status: 401 as const, file: null };
  const file = await findAccessibleFile(session.user, fileId);
  return file ? { status: 200 as const, file } : { status: 404 as const, file: null };
}
