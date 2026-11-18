import "server-only";
import { db } from "@/server/db";
import { can, viewableCategories, viewableSections, type DoctorAccess } from "@/server/access/policy";
import { getTimeline } from "@/server/medical/timeline";
import { measurementSelect } from "@/server/documents/review";

/**
 * Lecturas de datos clínicos para un médico. Cada función recibe un DoctorAccess ya
 * validado y consulta SOLO lo que sus permisos habilitan (no se filtra después en la UI).
 * Nunca se exponen datos de contacto del paciente (documento, teléfono, contactos de emergencia).
 */

export async function getPatientOverviewForDoctor(access: DoctorAccess) {
  const sections = new Set(viewableSections(access));
  const pid = access.patientId;
  const has = (k: string) => sections.has(k);

  const [identity, general, allergies, conditions, medications, familyHistory] = await Promise.all([
    db.patientProfile.findUniqueOrThrow({ where: { id: pid }, select: { user: { select: { firstName: true, lastName: true } } } }),
    has("GENERAL")
      ? db.patientProfile.findUnique({ where: { id: pid }, select: { dateOfBirth: true, sex: true, healthProfile: { select: { bloodType: true, heightCm: true, weightKg: true } } } })
      : null,
    has("ALLERGIES") ? db.allergy.findMany({ where: { patientId: pid }, orderBy: { createdAt: "desc" } }) : null,
    has("CONDITIONS") ? db.condition.findMany({ where: { patientId: pid }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }) : null,
    has("MEDICATIONS") ? db.medication.findMany({ where: { patientId: pid }, orderBy: { createdAt: "desc" } }) : null,
    has("FAMILY_HISTORY") ? db.familyHistory.findMany({ where: { patientId: pid }, orderBy: { createdAt: "desc" } }) : null,
  ]);

  return { name: identity.user, general, allergies, conditions, medications, familyHistory };
}

export async function getTimelineForDoctor(access: DoctorAccess) {
  const allowed = viewableCategories(access);
  if (allowed.length === 0) return [];
  return getTimeline(
    access.patientId,
    {},
    {
      allowedCategories: allowed,
      confirmedOnly: true,
      recordHref: (id) => `/doctor/patients/${access.patientId}/records/${id}`,
      healthHref: () => null,
    },
  );
}

/** Detalle de un registro: debe pertenecer al paciente del acceso Y a una categoría con permiso VIEW. */
export async function getRecordForDoctor(access: DoctorAccess, recordId: string) {
  if (!recordId || recordId.length > 64) return null;
  const allowed = viewableCategories(access);
  if (allowed.length === 0) return null;
  return db.medicalRecord.findFirst({
    where: { id: recordId, patientId: access.patientId, category: { slug: { in: allowed } } },
    select: {
      id: true,
      title: true,
      occurredOn: true,
      specialty: true,
      professionalName: true,
      description: true,
      tags: true,
      source: true,
      createdAt: true,
      category: { select: { slug: true, name: true } },
      institution: { select: { name: true } },
      files: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
      // Sólo resultados confirmados por el paciente; el registro ya está filtrado por categoría autorizada.
      measurements: { where: { reviewStatus: "CONFIRMED" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: measurementSelect },
      report: {
        select: {
          id: true,
          authorUserId: true,
          authorName: true,
          licenseNumber: true,
          licenseJurisdiction: true,
          specialty: true,
          currentVersion: true,
          createdAt: true,
          versions: { orderBy: { version: "desc" }, select: { version: true, title: true, content: true, changeReason: true, createdAt: true, createdBy: { select: { firstName: true, lastName: true } } } },
        },
      },
    },
  });
}

export type DoctorRecordDetail = NonNullable<Awaited<ReturnType<typeof getRecordForDoctor>>>;

export function canViewCategory(access: DoctorAccess, slug: string) {
  return can(access, "VIEW", "RECORD_CATEGORY", slug);
}
