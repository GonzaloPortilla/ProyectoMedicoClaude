import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/server/db";
import { can, type DoctorAccess } from "@/server/access/policy";
import { audit, type AuditContext } from "@/server/audit/log";
import { stripMetadata } from "@/server/files/sanitize";
import { scanFile } from "@/server/files/scan";
import { getStorage, newStorageKey } from "@/server/storage";
import { validateUpload } from "@/server/files/validation";
import { normalizeText } from "@/lib/text";
import { jurisdictionName } from "@/lib/jurisdictions";
import type { Result, UploadedFile } from "@/server/medical/records";

/**
 * Informes médicos.
 * - Sólo un médico con acceso vigente y permiso CREATE_MEDICAL_ENTRY sobre la categoría.
 * - Adjuntar un archivo exige además permiso UPLOAD.
 * - Se guarda un snapshot del autor (nombre, matrícula, jurisdicción, especialidad).
 * - Nunca se sobrescribe: corregir agrega una versión nueva (las versiones son inmutables en la base).
 */

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function searchTextFor(title: string, categoryName: string, specialty: string, author: string, content: string) {
  return normalizeText([title, categoryName, specialty, author, "informe", content].join(" ")).slice(0, 8000);
}

export async function createReport(
  access: DoctorAccess,
  input: { categorySlug: string; title: string; content: string },
  file?: UploadedFile | null,
  ctx: AuditContext = {},
): Promise<Result<{ recordId: string; reportId: string }>> {
  if (!can(access, "CREATE_MEDICAL_ENTRY", "RECORD_CATEGORY", input.categorySlug)) {
    return { ok: false, field: "categorySlug", error: "No tenés permiso para crear informes en esta categoría." };
  }
  if (file && !can(access, "UPLOAD", "RECORD_CATEGORY", input.categorySlug)) {
    return { ok: false, field: "file", error: "El paciente no te autorizó a adjuntar archivos." };
  }
  const [category, doctor] = await Promise.all([
    db.medicalCategory.findFirst({ where: { slug: input.categorySlug, isActive: true }, select: { id: true, name: true } }),
    db.user.findUnique({ where: { id: access.doctorUserId }, select: { firstName: true, lastName: true, doctorProfile: { select: { specialty: true, licenseNumber: true, jurisdiction: true } } } }),
  ]);
  if (!category) return { ok: false, field: "categorySlug", error: "Categoría no válida." };
  if (!doctor?.doctorProfile) return { ok: false, error: "Perfil profesional no encontrado." };

  let stored: { key: string; mime: string; safeName: string; size: number; sha256: string } | null = null;
  if (file) {
    const check = validateUpload(file.name, file.size, file.bytes);
    if (!check.ok) return { ok: false, field: "file", error: check.error };
    const key = newStorageKey();
    const buffer = stripMetadata(check.mime, Buffer.from(file.bytes));
    const scan = await scanFile(buffer, check.mime);
    if (!scan.clean) return { ok: false, field: "file", error: "El archivo no superó el control de seguridad." };
    await getStorage().put(key, buffer, check.mime);
    stored = { key, mime: check.mime, safeName: check.safeName, size: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") };
  }

  const authorName = `${doctor.firstName} ${doctor.lastName}`;
  const { specialty, licenseNumber, jurisdiction } = doctor.doctorProfile;
  try {
    const result = await db.$transaction(async (tx) => {
      const record = await tx.medicalRecord.create({
        data: {
          patientId: access.patientId,
          title: input.title,
          occurredOn: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z"),
          categoryId: category.id,
          specialty,
          professionalName: `${authorName} (${licenseNumber})`,
          source: "DOCTOR",
          createdById: access.doctorUserId,
          searchText: searchTextFor(input.title, category.name, specialty, authorName, input.content),
          files: stored
            ? { create: { patientId: access.patientId, storageKey: stored.key, originalName: stored.safeName, mimeType: stored.mime, sizeBytes: stored.size, sha256: stored.sha256, uploadedById: access.doctorUserId } }
            : undefined,
        },
        select: { id: true },
      });
      const report = await tx.medicalReport.create({
        data: {
          recordId: record.id,
          patientId: access.patientId,
          authorUserId: access.doctorUserId,
          authorName,
          licenseNumber,
          licenseJurisdiction: jurisdictionName(jurisdiction),
          specialty,
          versions: { create: { version: 1, title: input.title, content: input.content, contentSha256: sha(input.content), createdById: access.doctorUserId } },
        },
        select: { id: true },
      });
      return { recordId: record.id, reportId: report.id };
    });
    await audit(
      {
        action: "REPORT_CREATED",
        actorType: "DOCTOR",
        actorUserId: access.doctorUserId,
        subjectPatientId: access.patientId,
        resourceType: "MEDICAL_RECORD",
        resourceId: result.recordId,
        grantId: access.grantId,
        metadata: { categorySlug: input.categorySlug, toVersion: 1, fileCount: stored ? 1 : 0 },
      },
      ctx,
    );
    return { ok: true, data: result };
  } catch (error) {
    if (stored) await getStorage().delete(stored.key).catch(() => {});
    throw error;
  }
}

/** Corrección: sólo el autor, con acceso vigente y permiso de creación en la categoría. Agrega una versión. */
export async function correctReport(
  access: DoctorAccess,
  input: { reportId: string; title: string; content: string; changeReason: string },
  ctx: AuditContext = {},
): Promise<Result<{ recordId: string; version: number }>> {
  const report = await db.medicalReport.findFirst({
    where: { id: input.reportId, patientId: access.patientId, authorUserId: access.doctorUserId },
    select: { id: true, recordId: true, currentVersion: true, authorName: true, specialty: true, record: { select: { category: { select: { slug: true, name: true } } } } },
  });
  if (!report) return { ok: false, error: "El informe no existe o no sos su autor." };
  if (!can(access, "CREATE_MEDICAL_ENTRY", "RECORD_CATEGORY", report.record.category.slug)) {
    return { ok: false, error: "Ya no tenés permiso para modificar informes en esta categoría." };
  }
  const next = report.currentVersion + 1;
  await db.$transaction(async (tx) => {
    // La unicidad (reportId, version) evita que dos correcciones simultáneas pisen la misma versión.
    await tx.medicalReportVersion.create({
      data: { reportId: report.id, version: next, title: input.title, content: input.content, changeReason: input.changeReason, contentSha256: sha(input.content), createdById: access.doctorUserId },
    });
    const bumped = await tx.medicalReport.updateMany({ where: { id: report.id, currentVersion: report.currentVersion }, data: { currentVersion: next } });
    if (bumped.count !== 1) throw new Error("Conflicto de versión");
    await tx.medicalRecord.update({
      where: { id: report.recordId },
      data: { title: input.title, searchText: searchTextFor(input.title, report.record.category.name, report.specialty, report.authorName, input.content) },
    });
  });
  await audit(
    {
      action: "REPORT_CORRECTED",
      actorType: "DOCTOR",
      actorUserId: access.doctorUserId,
      subjectPatientId: access.patientId,
      resourceType: "MEDICAL_RECORD",
      resourceId: report.recordId,
      grantId: access.grantId,
      metadata: { categorySlug: report.record.category.slug, fromVersion: report.currentVersion, toVersion: next },
    },
    ctx,
  );
  return { ok: true, data: { recordId: report.recordId, version: next } };
}
