import "server-only";
import type { AccessAction } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { consumeLinkCode } from "@/server/access/codes";
import { activeGrantWhere } from "@/server/access/policy";
import { logAccess } from "@/server/access/log";
import { HEALTH_SECTION_KEYS, resourceId, type ResourceRef } from "@/features/access/resources";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string; field?: string };

export const REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000; // una solicitud pendiente vence a los 7 días

const pendingWhere = (now = new Date()) => ({ status: "PENDING" as const, expiresAt: { gt: now } });

async function isVerifiedDoctor(userId: string) {
  const p = await db.doctorProfile.findUnique({ where: { userId }, select: { verificationStatus: true, user: { select: { status: true } } } });
  return p?.verificationStatus === "VERIFIED" && p.user.status === "ACTIVE";
}

/** Recursos válidos: secciones conocidas y categorías activas existentes. */
async function sanitizeResources(resources: ResourceRef[]): Promise<ResourceRef[]> {
  const categories = new Set((await db.medicalCategory.findMany({ where: { isActive: true }, select: { slug: true } })).map((c) => c.slug));
  return resources.filter((r) => (r.type === "HEALTH_SECTION" ? (HEALTH_SECTION_KEYS as readonly string[]).includes(r.key) : categories.has(r.key)));
}

/** El médico ingresa el código que le dio el paciente. */
export async function createAccessRequest(
  doctorUserId: string,
  input: { code: string; message: string | null; requested: ResourceRef[] },
): Promise<Result<{ requestId: string }>> {
  if (!(await isVerifiedDoctor(doctorUserId))) return { ok: false, error: "Tu cuenta profesional tiene que estar verificada para solicitar accesos." };

  const patientId = await consumeLinkCode(input.code, doctorUserId);
  if (!patientId) return { ok: false, field: "code", error: "El código no es válido, ya se usó o venció. Pedile uno nuevo al paciente." };

  const patient = await db.patientProfile.findUnique({ where: { id: patientId }, select: { userId: true } });
  if (patient?.userId === doctorUserId) return { ok: false, field: "code", error: "No podés solicitar acceso a tu propia información." };

  const requested = await sanitizeResources(input.requested);
  // Una sola solicitud pendiente por par médico–paciente: la nueva reemplaza a la anterior.
  const request = await db.$transaction(async (tx) => {
    await tx.accessRequest.updateMany({ where: { doctorUserId, patientId, status: "PENDING" }, data: { status: "CANCELLED", respondedAt: new Date() } });
    return tx.accessRequest.create({
      data: {
        doctorUserId,
        patientId,
        message: input.message,
        requestedResources: requested.map(resourceId),
        expiresAt: new Date(Date.now() + REQUEST_TTL_MS),
      },
      select: { id: true },
    });
  });
  await logAccess({ patientId, actorUserId: doctorUserId, action: "REQUEST_CREATED", resourceId: request.id });
  return { ok: true, data: { requestId: request.id } };
}

const doctorPublicSelect = {
  id: true,
  firstName: true,
  lastName: true,
  doctorProfile: { select: { specialty: true, licenseNumber: true, jurisdiction: true, verificationStatus: true } },
} as const;

export async function listPendingRequestsForPatient(patientId: string) {
  return db.accessRequest.findMany({
    where: { patientId, ...pendingWhere() },
    orderBy: { createdAt: "desc" },
    select: { id: true, message: true, requestedResources: true, createdAt: true, expiresAt: true, doctor: { select: doctorPublicSelect } },
  });
}

export async function getPendingRequestForPatient(patientId: string, requestId: string) {
  if (!requestId || requestId.length > 64) return null;
  return db.accessRequest.findFirst({
    where: { id: requestId, patientId, ...pendingWhere() },
    select: { id: true, message: true, requestedResources: true, createdAt: true, expiresAt: true, doctor: { select: doctorPublicSelect } },
  });
}

export async function rejectRequest(patientId: string, requestId: string): Promise<boolean> {
  const { count } = await db.accessRequest.updateMany({ where: { id: requestId, patientId, ...pendingWhere() }, data: { status: "REJECTED", respondedAt: new Date() } });
  return count === 1;
}

export async function cancelRequest(doctorUserId: string, requestId: string): Promise<boolean> {
  const { count } = await db.accessRequest.updateMany({ where: { id: requestId, doctorUserId, status: "PENDING" }, data: { status: "CANCELLED", respondedAt: new Date() } });
  return count === 1;
}

export type ApprovalInput = { resources: ResourceRef[]; allowCreate: boolean; allowUpload: boolean; expiresAt: Date | null };

/** Construye las filas de permiso: VIEW por recurso; crear/subir sólo sobre categorías. */
export function buildPermissions(input: Pick<ApprovalInput, "resources" | "allowCreate" | "allowUpload">) {
  const rows: { resourceType: ResourceRef["type"]; resourceKey: string; action: AccessAction }[] = [];
  for (const r of input.resources) {
    rows.push({ resourceType: r.type, resourceKey: r.key, action: "VIEW" });
    if (r.type === "RECORD_CATEGORY") {
      if (input.allowCreate) rows.push({ resourceType: r.type, resourceKey: r.key, action: "CREATE_MEDICAL_ENTRY" });
      if (input.allowCreate && input.allowUpload) rows.push({ resourceType: r.type, resourceKey: r.key, action: "UPLOAD" });
    }
  }
  return rows;
}

/** El paciente acepta: crea el grant con sus permisos y reemplaza cualquier grant vigente previo. */
export async function approveRequest(patientId: string, patientUserId: string, requestId: string, input: ApprovalInput): Promise<Result<{ grantId: string }>> {
  const request = await db.accessRequest.findFirst({ where: { id: requestId, patientId, ...pendingWhere() }, select: { id: true, doctorUserId: true } });
  if (!request) return { ok: false, error: "La solicitud no existe o ya no está pendiente." };
  if (!(await isVerifiedDoctor(request.doctorUserId))) return { ok: false, error: "El profesional ya no está verificado." };

  const resources = await sanitizeResources(input.resources);
  if (resources.length === 0) return { ok: false, field: "resources", error: "Elegí al menos un dato para compartir" };
  if (input.expiresAt && input.expiresAt <= new Date()) return { ok: false, field: "duration", error: "La fecha de vencimiento tiene que ser futura" };

  const grant = await db.$transaction(async (tx) => {
    const claimed = await tx.accessRequest.updateMany({ where: { id: request.id, status: "PENDING" }, data: { status: "APPROVED", respondedAt: new Date() } });
    if (claimed.count !== 1) return null;
    await tx.accessGrant.updateMany({
      where: { patientId, doctorUserId: request.doctorUserId, status: "ACTIVE" },
      data: { status: "SUPERSEDED", revokedAt: new Date() },
    });
    return tx.accessGrant.create({
      data: {
        patientId,
        doctorUserId: request.doctorUserId,
        requestId: request.id,
        expiresAt: input.expiresAt,
        permissions: { create: buildPermissions({ ...input, resources }) },
      },
      select: { id: true },
    });
  });
  if (!grant) return { ok: false, error: "La solicitud ya fue respondida." };
  await logAccess({ patientId, actorUserId: patientUserId, grantId: grant.id, action: "GRANT_CREATED" });
  return { ok: true, data: { grantId: grant.id } };
}

/** Revocación inmediata: la próxima consulta del médico ya no encuentra un grant vigente. */
export async function revokeGrant(patientId: string, patientUserId: string, grantId: string): Promise<boolean> {
  const { count } = await db.accessGrant.updateMany({
    where: { id: grantId, patientId, status: "ACTIVE" },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  if (count === 1) await logAccess({ patientId, actorUserId: patientUserId, grantId, action: "GRANT_REVOKED" });
  return count === 1;
}

const grantListSelect = {
  id: true,
  status: true,
  startsAt: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  permissions: { select: { resourceType: true, resourceKey: true, action: true } },
} as const;

/** Accesos del paciente: vigentes e históricos (vencidos / revocados). */
export async function listGrantsForPatient(patientId: string) {
  const now = new Date();
  const grants = await db.accessGrant.findMany({
    where: { patientId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      ...grantListSelect,
      doctor: { select: doctorPublicSelect },
      logs: { where: { action: { in: ["VIEW_PATIENT", "VIEW_RECORD", "VIEW_FILE", "CREATE_REPORT", "CORRECT_REPORT"] } }, orderBy: { createdAt: "desc" }, take: 5, select: { action: true, createdAt: true } },
    },
  });
  const isActive = (g: (typeof grants)[number]) => g.status === "ACTIVE" && !g.revokedAt && (!g.expiresAt || g.expiresAt > now) && g.doctor.doctorProfile?.verificationStatus === "VERIFIED";
  return { active: grants.filter(isActive), past: grants.filter((g) => !isActive(g) && g.status !== "SUPERSEDED") };
}

/** Pacientes con acceso vigente para el médico. */
export async function listActiveGrantsForDoctor(doctorUserId: string) {
  const now = new Date();
  return db.accessGrant.findMany({
    where: { doctorUserId, ...activeGrantWhere(now) },
    orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }],
    select: { ...grantListSelect, patient: { select: { id: true, user: { select: { firstName: true, lastName: true } } } } },
  });
}

export async function listPendingRequestsForDoctor(doctorUserId: string) {
  return db.accessRequest.findMany({
    where: { doctorUserId, ...pendingWhere() },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, expiresAt: true, patient: { select: { user: { select: { firstName: true, lastName: true } } } } },
  });
}
