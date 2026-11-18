import "server-only";
import { db } from "@/server/db";
import { hasRole } from "@/server/auth/roles";
import { validateSessionToken } from "@/server/auth/session";
import { canViewCategory } from "@/server/access/doctor-view";
import { getDoctorAccess } from "@/server/access/policy";
import { audit, type AuditContext } from "@/server/audit/log";
import { verifyFileSignature, type FileDisposition } from "@/server/files/urls";
import type { Role } from "@/generated/prisma/enums";

export type FileRequester = { id: string; roles: readonly Role[] };

const fileSelect = {
  id: true,
  storageKey: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  recordId: true,
  patientId: true,
  record: { select: { category: { select: { slug: true } } } },
} as const;

export type AccessibleFile = {
  id: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  recordId: string;
  patientId: string;
  via: "owner" | "doctor";
  grantId: string | null;
  categorySlug: string;
};

/**
 * Única puerta de acceso a un archivo médico.
 *
 * 1. El paciente dueño puede leer sus archivos.
 * 2. Un médico puede leerlo sólo con un acceso VIGENTE sobre ese paciente y permiso VIEW
 *    sobre la categoría del registro.
 * 3. Nadie más (incluido el administrador).
 *
 * Devuelve null tanto si el archivo no existe como si no hay permiso (no revela qué ids existen).
 */
export async function findAccessibleFile(requester: FileRequester, fileId: string): Promise<AccessibleFile | null> {
  if (!fileId || fileId.length > 64) return null;
  const file = await db.medicalFile.findUnique({ where: { id: fileId }, select: { ...fileSelect, patient: { select: { userId: true } } } });
  if (!file) return null;
  const base = {
    id: file.id,
    storageKey: file.storageKey,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    recordId: file.recordId,
    patientId: file.patientId,
    categorySlug: file.record.category.slug,
  };

  if (hasRole(requester.roles, "PATIENT") && file.patient.userId === requester.id) return { ...base, via: "owner", grantId: null };

  if (hasRole(requester.roles, "DOCTOR")) {
    const access = await getDoctorAccess(requester.id, file.patientId);
    if (access && canViewCategory(access, file.record.category.slug)) return { ...base, via: "doctor", grantId: access.grantId };
  }
  return null;
}

export type FileRequestResult =
  | { status: 200; file: AccessibleFile; disposition: FileDisposition }
  | { status: 401 | 403 | 404; file: null; disposition?: undefined };

/**
 * Valida una request a /api/files/[fileId]: sesión → permiso → enlace temporal firmado.
 * Cada acceso (y cada intento denegado de un médico) queda auditado.
 */
export async function authorizeFileRequest(
  sessionToken: string | undefined,
  fileId: string,
  params: { exp?: string | null; sig?: string | null; download?: string | null } = {},
  ctx: AuditContext = {},
): Promise<FileRequestResult> {
  if (!sessionToken) return { status: 401, file: null };
  const session = await validateSessionToken(sessionToken);
  if (!session) return { status: 401, file: null };
  const user = session.user;

  const file = await findAccessibleFile(user, fileId);
  if (!file) {
    if (hasRole(user.roles, "DOCTOR")) {
      // Intento de un médico sobre un archivo ajeno: se registra sólo si el archivo existe.
      const target = await db.medicalFile.findUnique({ where: { id: fileId }, select: { patientId: true } });
      if (target) await audit({ action: "ACCESS_DENIED", outcome: "DENIED", actorType: "DOCTOR", actorUserId: user.id, subjectPatientId: target.patientId, resourceType: "MEDICAL_FILE", resourceId: fileId }, ctx);
    }
    return { status: 404, file: null };
  }

  const signature = verifyFileSignature(user.id, file.id, params);
  if (!signature.ok) return { status: 403, file: null };

  await audit(
    {
      action: signature.disposition === "attachment" ? "FILE_DOWNLOADED" : "FILE_VIEWED",
      actorType: file.via === "doctor" ? "DOCTOR" : "PATIENT",
      actorUserId: user.id,
      subjectPatientId: file.patientId,
      resourceType: "MEDICAL_FILE",
      resourceId: file.id,
      grantId: file.grantId,
      metadata: { categorySlug: file.categorySlug, mimeType: file.mimeType },
    },
    ctx,
  );
  return { status: 200, file, disposition: signature.disposition };
}
