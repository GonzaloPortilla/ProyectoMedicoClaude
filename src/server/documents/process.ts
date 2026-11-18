import "server-only";
import { createHash } from "node:crypto";
import type { DocumentProcessingStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { getStorage } from "@/server/storage";
import { audit } from "@/server/audit/log";
import { buildSearchText } from "@/server/medical/records";
import { analyzeDocumentText } from "@/server/documents/analysis/analyze";
import { loadConcepts } from "@/server/documents/concepts-store";
import { getDocumentExtractionService } from "@/server/documents/extraction/service";
import { ExtractionError, type DocumentExtractionService } from "@/server/documents/extraction/types";

/**
 * PIPELINE DE UN ESTUDIO
 *
 *   UPLOADED → PROCESSING → READY_FOR_REVIEW → CONFIRMED
 *                        ↘ FAILED (el estudio original sigue funcionando igual)
 *
 * 1. Lee el archivo del storage (sólo lectura) y verifica su hash: el original no cambió.
 * 2. Extrae el texto (PDF u OCR) con el DocumentExtractionService configurado.
 * 3. Propone metadatos y detecta resultados de laboratorio.
 * 4. Guarda todo APARTE (document_extractions / medical_measurements) como PENDIENTE de revisión.
 * Nada de lo extraído es definitivo hasta que el paciente lo confirma.
 */

/** Un procesamiento "colgado" (p. ej. se reinició el servidor) se puede retomar pasado este tiempo. */
const STALE_MS = 10 * 60_000;
const MAX_TEXT = 200_000;

export async function processDocument(fileId: string, opts: { service?: DocumentExtractionService; now?: Date } = {}): Promise<DocumentProcessingStatus | null> {
  const now = opts.now ?? new Date();
  // Reserva atómica: dos ejecuciones simultáneas no procesan el mismo archivo.
  const claimed = await db.documentExtraction.updateMany({
    where: { fileId, OR: [{ status: { in: ["UPLOADED", "FAILED"] } }, { status: "PROCESSING", startedAt: { lt: new Date(now.getTime() - STALE_MS) } }] },
    data: { status: "PROCESSING", startedAt: now, finishedAt: null, errorCode: null, attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return null;

  const extraction = await db.documentExtraction.findUniqueOrThrow({
    where: { fileId },
    select: {
      id: true,
      patientId: true,
      recordId: true,
      metadataReviewed: true,
      file: { select: { storageKey: true, mimeType: true, originalName: true, sha256: true } },
      record: { select: { occurredOn: true, institutionId: true } },
    },
  });

  const fail = async (code: string) => {
    await db.documentExtraction.update({ where: { id: extraction.id }, data: { status: "FAILED", errorCode: code.slice(0, 40), finishedAt: new Date() } });
    await audit({ action: "DOCUMENT_PROCESSED", outcome: "FAILURE", actorType: "SYSTEM", subjectPatientId: extraction.patientId, resourceType: "MEDICAL_RECORD", resourceId: extraction.recordId, metadata: { reason: code } });
    return "FAILED" as const;
  };

  try {
    const bytes = await getStorage().get(extraction.file.storageKey);
    // Integridad: el archivo del storage debe ser exactamente el que se guardó.
    if (createHash("sha256").update(bytes).digest("hex") !== extraction.file.sha256) return await fail("INTEGRITY_MISMATCH");

    const service = opts.service ?? getDocumentExtractionService();
    const extracted = await service.extract({ bytes: new Uint8Array(bytes), mimeType: extraction.file.mimeType, filename: extraction.file.originalName });

    const [categories, concepts] = await Promise.all([db.medicalCategory.findMany({ where: { isActive: true }, select: { slug: true } }), loadConcepts()]);
    const analysis = analyzeDocumentText({
      text: extracted.text,
      filename: extraction.file.originalName,
      categories: categories.map((c) => c.slug),
      concepts,
      ocr: extracted.method === "OCR",
      now,
    });

    const suggestedDate = analysis.suggestions.occurredOn ? new Date(`${analysis.suggestions.occurredOn.value}T00:00:00.000Z`) : null;
    const measuredOn = !extraction.metadataReviewed && suggestedDate ? suggestedDate : extraction.record.occurredOn;
    const status: DocumentProcessingStatus = extraction.metadataReviewed && analysis.measurements.length === 0 ? "CONFIRMED" : "READY_FOR_REVIEW";

    await db.$transaction(async (tx) => {
      // Reintento: se reemplazan sólo los resultados que nadie revisó todavía.
      await tx.medicalMeasurement.deleteMany({ where: { extractionId: extraction.id, reviewStatus: "PENDING" } });
      if (analysis.measurements.length) {
        await tx.medicalMeasurement.createMany({
          data: analysis.measurements.map((m) => ({
            patientId: extraction.patientId,
            recordId: extraction.recordId,
            fileId,
            extractionId: extraction.id,
            conceptId: m.conceptId,
            originalName: m.originalName.slice(0, 120),
            normalizedKey: m.normalizedKey,
            valueText: m.valueText.slice(0, 40),
            valueNumeric: m.valueNumeric,
            unit: m.unit,
            refLow: m.refLow,
            refHigh: m.refHigh,
            refText: m.refText,
            documentFlag: m.documentFlag,
            measuredOn,
            institutionId: extraction.record.institutionId,
            extractionMethod: extracted.method,
            confidence: m.confidence,
            source: "SYSTEM" as const,
            detected: { originalName: m.originalName, valueText: m.valueText, unit: m.unit, refText: m.refText, line: m.line } as Prisma.InputJsonValue,
          })),
        });
      }
      await tx.documentExtraction.update({
        where: { id: extraction.id },
        data: {
          status,
          method: extracted.method,
          provider: extracted.provider,
          text: extracted.text.slice(0, MAX_TEXT),
          pageCount: extracted.pageCount,
          ocrConfidence: extracted.ocrConfidence,
          suggestions: analysis.suggestions as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
      await refreshSearchText(tx, extraction.recordId);
    });

    await audit({
      action: "DOCUMENT_PROCESSED",
      actorType: "SYSTEM",
      subjectPatientId: extraction.patientId,
      resourceType: "MEDICAL_RECORD",
      resourceId: extraction.recordId,
      metadata: { method: extracted.method, resultCount: analysis.measurements.length, status },
    });
    return status;
  } catch (error) {
    if (error instanceof ExtractionError) return fail(error.code);
    console.error("[documents] Error procesando un estudio", error instanceof Error ? error.message : "error");
    return fail("INTERNAL_ERROR");
  }
}

/** Ejecuta el procesamiento sin propagar errores (para `after()` y tareas en segundo plano). */
export async function processDocumentSafely(fileId: string) {
  try {
    await processDocument(fileId);
  } catch (error) {
    console.error("[documents] Error inesperado", error instanceof Error ? error.message : "error");
  }
}

/** Recalcula el texto de búsqueda del registro: sus campos + el texto extraído de sus archivos. */
export async function refreshSearchText(tx: Prisma.TransactionClient, recordId: string) {
  const record = await tx.medicalRecord.findUniqueOrThrow({
    where: { id: recordId },
    select: {
      title: true,
      specialty: true,
      professionalName: true,
      description: true,
      tags: true,
      category: { select: { name: true } },
      institution: { select: { name: true } },
      files: { select: { originalName: true } },
      extractions: { select: { text: true } },
    },
  });
  const extracted = record.extractions.map((e) => e.text ?? "").join(" ").slice(0, 6000);
  await tx.medicalRecord.update({
    where: { id: recordId },
    data: {
      searchText: buildSearchText([record.title, record.category.name, record.specialty, record.institution?.name, record.professionalName, record.description, record.tags, record.files.map((f) => f.originalName), extracted]),
    },
  });
}
