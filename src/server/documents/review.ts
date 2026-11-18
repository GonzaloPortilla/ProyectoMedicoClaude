import "server-only";
import type { MeasurementReviewStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { audit, type AuditContext } from "@/server/audit/log";
import { upsertInstitution } from "@/server/medical/institutions";
import { refreshSearchText } from "@/server/documents/process";
import { findDuplicateFile, findPossibleDuplicates } from "@/server/documents/duplicates";
import { parseLocaleNumber } from "@/server/documents/analysis/numbers";
import { measurementKey } from "@/server/documents/analysis/concepts";
import { loadConcepts } from "@/server/documents/concepts-store";
import { normalizeText } from "@/lib/text";
import type { DocumentSuggestions } from "@/server/documents/analysis/metadata";

/**
 * Revisión del paciente. Todas las funciones reciben el patientId de la sesión y lo usan
 * como filtro: un id de otro paciente simplemente no se encuentra.
 */

export const measurementSelect = {
  id: true,
  originalName: true,
  normalizedKey: true,
  valueText: true,
  valueNumeric: true,
  unit: true,
  refLow: true,
  refHigh: true,
  refText: true,
  documentFlag: true,
  measuredOn: true,
  extractionMethod: true,
  confidence: true,
  reviewStatus: true,
  detected: true,
  editedAt: true,
  confirmedAt: true,
  verifiedAt: true,
  source: true,
  createdAt: true,
  concept: { select: { code: true, displayName: true } },
  confirmedBy: { select: { firstName: true, lastName: true } },
  verifiedBy: { select: { firstName: true, lastName: true } },
} as const;

/** Todo lo necesario para la pantalla de revisión de un estudio. */
export async function getReviewData(patientId: string, recordId: string) {
  if (!recordId || recordId.length > 64) return null;
  const record = await db.medicalRecord.findFirst({
    where: { id: recordId, patientId },
    select: {
      id: true,
      title: true,
      occurredOn: true,
      categoryId: true,
      institutionId: true,
      specialty: true,
      professionalName: true,
      source: true,
      category: { select: { slug: true, name: true } },
      institution: { select: { name: true } },
      report: { select: { id: true } },
      files: { orderBy: { createdAt: "asc" }, select: { id: true, originalName: true, mimeType: true, sizeBytes: true, sha256: true, originalSha256: true } },
      extractions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, fileId: true, status: true, method: true, provider: true, pageCount: true, ocrConfidence: true, suggestions: true, metadataReviewed: true, errorCode: true, startedAt: true, finishedAt: true, reviewedAt: true, text: true },
      },
      measurements: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: measurementSelect },
    },
  });
  if (!record) return null;
  const extraction = record.extractions[0] ?? null;
  // Mismo contenido subido antes en OTRO registro (el propio archivo no cuenta).
  const sameFile = record.files[0]
    ? await db.medicalFile.findFirst({
        where: { patientId, recordId: { not: record.id }, OR: [{ originalSha256: record.files[0].originalSha256 ?? record.files[0].sha256 }, { sha256: record.files[0].sha256 }] },
        select: { record: { select: { id: true, title: true, occurredOn: true } } },
      })
    : null;
  // Con datos sin confirmar, la fecha del registro es provisoria (la de subida): se compara con lo detectado.
  const sugg = (extraction?.suggestions ?? null) as DocumentSuggestions | null;
  let probe: { id: string; title: string; occurredOn: Date; categoryId: string; institutionId: string | null } | null = record;
  if (extraction && !extraction.metadataReviewed) {
    if (!sugg?.occurredOn) probe = null;
    else {
      const instName = sugg.institution?.value;
      const inst = instName ? await db.institution.findFirst({ where: { patientId, normalizedName: normalizeText(instName) }, select: { id: true } }) : null;
      const cat = sugg.categorySlug ? await db.medicalCategory.findFirst({ where: { slug: sugg.categorySlug.value }, select: { id: true } }) : null;
      probe = { id: record.id, title: sugg.title?.value ?? record.title, occurredOn: new Date(`${sugg.occurredOn.value}T00:00:00.000Z`), categoryId: cat?.id ?? record.categoryId, institutionId: inst?.id ?? null };
    }
  }
  const similar = probe ? await findPossibleDuplicates(patientId, probe) : [];
  const duplicates = [
    ...(sameFile ? [{ recordId: sameFile.record.id, title: sameFile.record.title, occurredOn: sameFile.record.occurredOn, reason: "same_file" as const }] : []),
    ...similar.filter((d) => d.recordId !== sameFile?.record.id),
  ];
  return { record, extraction: extraction ? { ...extraction, suggestions: (extraction.suggestions ?? null) as DocumentSuggestions | null } : null, duplicates };
}

export type ReviewData = NonNullable<Awaited<ReturnType<typeof getReviewData>>>;

export { findDuplicateFile };

/** Si ya no queda nada por revisar, el documento pasa a CONFIRMED. */
async function syncExtractionStatus(recordId: string) {
  const extraction = await db.documentExtraction.findFirst({ where: { recordId, status: "READY_FOR_REVIEW", metadataReviewed: true }, select: { id: true } });
  if (!extraction) return;
  const pending = await db.medicalMeasurement.count({ where: { recordId, reviewStatus: "PENDING" } });
  if (pending === 0) await db.documentExtraction.update({ where: { id: extraction.id }, data: { status: "CONFIRMED" } });
}

export type DocumentDetailsInput = {
  title: string;
  occurredOn: Date;
  categorySlug: string;
  specialty: string | null;
  institution: string | null;
  professionalName: string | null;
};

/**
 * El paciente confirma (o corrige) los datos propuestos del estudio. Sólo sobre registros
 * cargados por él; los informes de médicos no se editan.
 */
export async function confirmDocumentDetails(patientId: string, actorUserId: string, recordId: string, input: DocumentDetailsInput, ctx: AuditContext = {}) {
  const record = await db.medicalRecord.findFirst({ where: { id: recordId, patientId, source: "PATIENT", report: null }, select: { id: true } });
  if (!record) return { ok: false as const, error: "No encontramos el estudio." };
  const category = await db.medicalCategory.findFirst({ where: { slug: input.categorySlug, isActive: true }, select: { id: true } });
  if (!category) return { ok: false as const, field: "categorySlug", error: "Elegí un tipo válido" };

  await db.$transaction(async (tx) => {
    const institution = await upsertInstitution(tx, patientId, input.institution);
    await tx.medicalRecord.update({
      where: { id: record.id },
      data: { title: input.title, occurredOn: input.occurredOn, categoryId: category.id, specialty: input.specialty, professionalName: input.professionalName, institutionId: institution?.id ?? null },
    });
    // Las mediciones toman la fecha e institución confirmadas del estudio.
    await tx.medicalMeasurement.updateMany({ where: { recordId: record.id, patientId }, data: { measuredOn: input.occurredOn, institutionId: institution?.id ?? null } });
    await tx.documentExtraction.updateMany({ where: { recordId: record.id, patientId }, data: { metadataReviewed: true, reviewedAt: new Date(), reviewedById: actorUserId } });
    await refreshSearchText(tx, record.id);
  });
  await syncExtractionStatus(record.id);
  await audit(
    { action: "DOCUMENT_REVIEWED", actorType: "PATIENT", actorUserId, subjectPatientId: patientId, resourceType: "MEDICAL_RECORD", resourceId: record.id, metadata: { categorySlug: input.categorySlug, occurredOn: input.occurredOn.toISOString().slice(0, 10) } },
    ctx,
  );
  return { ok: true as const };
}

/** Confirma, descarta o restaura resultados de un estudio (uno, varios o todos los pendientes). */
export async function reviewMeasurements(
  patientId: string,
  actorUserId: string,
  recordId: string,
  change: { ids: string[] | "all-pending"; to: MeasurementReviewStatus },
  ctx: AuditContext = {},
) {
  const where = {
    patientId,
    recordId,
    ...(change.ids === "all-pending" ? { reviewStatus: "PENDING" as const } : { id: { in: change.ids.slice(0, 200) } }),
  };
  const data =
    change.to === "CONFIRMED"
      ? { reviewStatus: "CONFIRMED" as const, confirmedById: actorUserId, confirmedAt: new Date() }
      : change.to === "DISCARDED"
        ? { reviewStatus: "DISCARDED" as const, confirmedById: null, confirmedAt: null }
        : { reviewStatus: "PENDING" as const, confirmedById: null, confirmedAt: null };
  const { count } = await db.medicalMeasurement.updateMany({ where, data });
  if (count === 0) return 0;
  await syncExtractionStatus(recordId);
  await audit(
    {
      action: "MEASUREMENTS_REVIEWED",
      actorType: "PATIENT",
      actorUserId,
      subjectPatientId: patientId,
      resourceType: "MEDICAL_RECORD",
      resourceId: recordId,
      metadata: change.to === "CONFIRMED" ? { confirmed: count } : change.to === "DISCARDED" ? { discarded: count } : { status: "PENDING", resultCount: count },
    },
    ctx,
  );
  return count;
}

export type MeasurementEdit = {
  conceptCode: string | null;
  valueText: string;
  unit: string | null;
  refLow: string | null;
  refHigh: string | null;
};

/**
 * Corrección manual de un resultado. El nombre original del documento NO se modifica y los
 * valores detectados quedan guardados en `detected`. Guardar implica confirmarlo.
 */
export async function updateMeasurement(patientId: string, actorUserId: string, measurementId: string, input: MeasurementEdit, ctx: AuditContext = {}) {
  if (!measurementId || measurementId.length > 64) return { ok: false as const, error: "Resultado no encontrado." };
  const current = await db.medicalMeasurement.findFirst({ where: { id: measurementId, patientId }, select: { id: true, recordId: true, originalName: true } });
  if (!current) return { ok: false as const, error: "Resultado no encontrado." };

  const concepts = await loadConcepts();
  const concept = input.conceptCode ? concepts.find((c) => c.code === input.conceptCode) : null;
  if (input.conceptCode && !concept) return { ok: false as const, field: "conceptCode", error: "Elegí un indicador válido" };
  const qualified = /^[<>≤≥]/.test(input.valueText.trim());
  const numeric = qualified ? null : parseLocaleNumber(input.valueText);
  const low = input.refLow ? parseLocaleNumber(input.refLow) : null;
  const high = input.refHigh ? parseLocaleNumber(input.refHigh) : null;
  if (input.refLow && low === null) return { ok: false as const, field: "refLow", error: "Ingresá un número" };
  if (input.refHigh && high === null) return { ok: false as const, field: "refHigh", error: "Ingresá un número" };
  if (low !== null && high !== null && low > high) return { ok: false as const, field: "refHigh", error: "Debe ser mayor que el mínimo" };

  await db.medicalMeasurement.update({
    where: { id: current.id },
    data: {
      conceptId: concept?.id ?? null,
      normalizedKey: measurementKey(current.originalName, concept?.code),
      valueText: input.valueText.trim().slice(0, 40),
      valueNumeric: numeric,
      unit: input.unit,
      refLow: low,
      refHigh: high,
      refText: low !== null || high !== null ? [low !== null ? `${input.refLow}` : null, high !== null ? `${input.refHigh}` : null].filter(Boolean).join(" - ") : null,
      editedAt: new Date(),
      reviewStatus: "CONFIRMED",
      confirmedById: actorUserId,
      confirmedAt: new Date(),
    },
  });
  await syncExtractionStatus(current.recordId);
  await audit(
    { action: "MEASUREMENTS_REVIEWED", actorType: "PATIENT", actorUserId, subjectPatientId: patientId, resourceType: "MEDICAL_RECORD", resourceId: current.recordId, metadata: { edited: 1, confirmed: 1 } },
    ctx,
  );
  return { ok: true as const, recordId: current.recordId };
}

/**
 * Registros anteriores (o cargados sin análisis): el paciente puede pedir que se analicen.
 * Crea la extracción si no existe; los datos del estudio ya se consideran revisados.
 */
export async function requestAnalysis(patientId: string, recordId: string) {
  const file = await db.medicalFile.findFirst({ where: { recordId, patientId, record: { source: "PATIENT", report: null } }, orderBy: { createdAt: "asc" }, select: { id: true, extraction: { select: { status: true } } } });
  if (!file) return null;
  if (!file.extraction) await db.documentExtraction.create({ data: { patientId, recordId, fileId: file.id, metadataReviewed: true } });
  // Sólo se re-ejecuta lo que falló o quedó sin terminar (un PROCESSING reciente no se pisa).
  else if (!["FAILED", "PROCESSING", "UPLOADED"].includes(file.extraction.status)) return null;
  return file.id;
}
