import "server-only";
import type { AccessAction, AccessResourceType } from "@/generated/prisma/enums";
import { db } from "@/server/db";

/**
 * POLÍTICA DE ACCESO MÉDICO → PACIENTE
 *
 * Única fuente de verdad para decidir si un médico puede ver o hacer algo sobre un
 * paciente. Se evalúa en CADA request contra la base (sin caché), así que:
 *  - un acceso revocado deja de funcionar en la siguiente consulta;
 *  - un acceso vencido deja de funcionar en el instante en que vence;
 *  - si el administrador retira la verificación del médico, pierde todos sus accesos.
 *
 * Las consultas de datos clínicos para médicos reciben un `DoctorAccess` y sólo piden
 * a la base lo que sus permisos habilitan: lo no autorizado nunca sale del servidor.
 */

export type PermissionKey = `${AccessResourceType}:${string}:${AccessAction}`;

export type DoctorAccess = {
  grantId: string;
  patientId: string;
  doctorUserId: string;
  expiresAt: Date | null;
  permissions: ReadonlySet<PermissionKey>;
};

export function permissionKey(type: AccessResourceType, key: string, action: AccessAction): PermissionKey {
  return `${type}:${key}:${action}`;
}

/** Condición SQL de un grant vigente en el instante `now`. */
export function activeGrantWhere(now: Date) {
  return {
    status: "ACTIVE" as const,
    revokedAt: null,
    startsAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    doctor: { status: "ACTIVE" as const, doctorProfile: { verificationStatus: "VERIFIED" as const } },
  };
}

/** Devuelve el acceso vigente del médico sobre el paciente, o null. */
export async function getDoctorAccess(doctorUserId: string, patientId: string, now: Date = new Date()): Promise<DoctorAccess | null> {
  if (!doctorUserId || !patientId || patientId.length > 64) return null;
  const grant = await db.accessGrant.findFirst({
    where: { doctorUserId, patientId, ...activeGrantWhere(now) },
    orderBy: { createdAt: "desc" },
    select: { id: true, patientId: true, doctorUserId: true, expiresAt: true, permissions: { select: { resourceType: true, resourceKey: true, action: true } } },
  });
  if (!grant) return null;
  return {
    grantId: grant.id,
    patientId: grant.patientId,
    doctorUserId: grant.doctorUserId,
    expiresAt: grant.expiresAt,
    permissions: new Set(grant.permissions.map((p) => permissionKey(p.resourceType, p.resourceKey, p.action))),
  };
}

export function can(access: DoctorAccess, action: AccessAction, type: AccessResourceType, key: string): boolean {
  return access.permissions.has(permissionKey(type, key, action));
}

export function keysWith(access: DoctorAccess, type: AccessResourceType, action: AccessAction): string[] {
  const prefix = `${type}:`;
  const suffix = `:${action}`;
  return [...access.permissions].filter((p) => p.startsWith(prefix) && p.endsWith(suffix)).map((p) => p.slice(prefix.length, -suffix.length));
}

export const viewableCategories = (a: DoctorAccess) => keysWith(a, "RECORD_CATEGORY", "VIEW");
export const viewableSections = (a: DoctorAccess) => keysWith(a, "HEALTH_SECTION", "VIEW");
export const creatableCategories = (a: DoctorAccess) => keysWith(a, "RECORD_CATEGORY", "CREATE_MEDICAL_ENTRY");
