import "server-only";
import { createHash } from "node:crypto";
import type { DataSource } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { getStorage, newStorageKey } from "@/server/storage";
import { validateUpload } from "@/server/files/validation";
import { upsertInstitution } from "@/server/medical/institutions";
import { normalizeText } from "@/lib/text";
import type { RecordInput } from "@/features/records/schemas";

/**
 * Registros médicos (estudios, consultas, informes…). Todas las funciones reciben el
 * patientId ya resuelto desde la sesión y lo usan como filtro obligatorio.
 */

export type Actor = { userId: string; source: DataSource };
export type UploadedFile = { name: string; size: number; bytes: Uint8Array };
export type Result<T> = { ok: true; data: T } | { ok: false; error: string; field?: string };

export async function listActiveCategories() {
  return db.medicalCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, slug: true, name: true },
  });
}

function buildSearchText(parts: Array<string | null | undefined | string[]>): string {
  return normalizeText(parts.flat().filter(Boolean).join(" ")).slice(0, 8000);
}

export async function createRecord(patientId: string, actor: Actor, input: RecordInput, file?: UploadedFile | null): Promise<Result<{ recordId: string }>> {
  const category = await db.medicalCategory.findFirst({ where: { slug: input.categorySlug, isActive: true }, select: { id: true, name: true } });
  if (!category) return { ok: false, field: "categorySlug", error: "Elegí un tipo válido" };

  let stored: { key: string; mime: string; safeName: string; size: number; sha256: string } | null = null;
  if (file) {
    const check = validateUpload(file.name, file.size, file.bytes);
    if (!check.ok) return { ok: false, field: "file", error: check.error };
    const key = newStorageKey();
    const buffer = Buffer.from(file.bytes);
    await getStorage().put(key, buffer, check.mime);
    stored = { key, mime: check.mime, safeName: check.safeName, size: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") };
  }

  const title = input.title ?? (stored ? stored.safeName.replace(/\.[^.]+$/, "") : category.name);

  try {
    const record = await db.$transaction(async (tx) => {
      const institution = await upsertInstitution(tx, patientId, input.institution);
      return tx.medicalRecord.create({
        data: {
          patientId,
          title,
          occurredOn: input.occurredOn,
          categoryId: category.id,
          specialty: input.specialty,
          institutionId: institution?.id ?? null,
          professionalName: input.professionalName,
          description: input.description,
          tags: input.tags,
          source: actor.source,
          createdById: actor.userId,
          searchText: buildSearchText([title, category.name, input.specialty, institution?.name, input.professionalName, input.description, input.tags, stored?.safeName]),
          files: stored
            ? {
                create: {
                  patientId,
                  storageKey: stored.key,
                  originalName: stored.safeName,
                  mimeType: stored.mime,
                  sizeBytes: stored.size,
                  sha256: stored.sha256,
                  uploadedById: actor.userId,
                },
              }
            : undefined,
        },
        select: { id: true },
      });
    });
    return { ok: true, data: { recordId: record.id } };
  } catch (error) {
    // Si falla la base, no dejar el archivo huérfano en el storage.
    if (stored) await getStorage().delete(stored.key).catch(() => {});
    throw error;
  }
}

/**
 * Borra el registro y sus archivos. Devuelve false si no existe, no pertenece al paciente
 * o no fue cargado por el paciente (los informes de médicos no se pueden borrar).
 */
export async function deleteRecord(patientId: string, recordId: string): Promise<boolean> {
  const record = await db.medicalRecord.findFirst({
    where: { id: recordId, patientId, source: "PATIENT", report: null },
    select: { id: true, files: { select: { storageKey: true } } },
  });
  if (!record) return false;
  await db.medicalRecord.delete({ where: { id: record.id } });
  for (const f of record.files) {
    await getStorage()
      .delete(f.storageKey)
      .catch((error) => console.error("[storage] No se pudo borrar", f.storageKey, error));
  }
  return true;
}

const recordDetailSelect = {
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
  institution: { select: { id: true, name: true } },
  createdBy: { select: { firstName: true, lastName: true } },
  report: {
    select: {
      id: true,
      authorName: true,
      licenseNumber: true,
      licenseJurisdiction: true,
      specialty: true,
      currentVersion: true,
      createdAt: true,
      versions: { orderBy: { version: "desc" as const }, select: { version: true, title: true, content: true, changeReason: true, createdAt: true } },
    },
  },
  files: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true }, orderBy: { createdAt: "asc" as const } },
} as const;

export async function getRecord(patientId: string, recordId: string) {
  if (!recordId || recordId.length > 64) return null;
  return db.medicalRecord.findFirst({ where: { id: recordId, patientId }, select: recordDetailSelect });
}

export type RecordDetail = NonNullable<Awaited<ReturnType<typeof getRecord>>>;

export async function listRecords(patientId: string, opts: { withFilesOnly?: boolean; take?: number } = {}) {
  return db.medicalRecord.findMany({
    where: { patientId, ...(opts.withFilesOnly ? { files: { some: {} } } : {}) },
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
    take: opts.take ?? 200,
    select: recordDetailSelect,
  });
}

export async function countRecords(patientId: string) {
  const [records, files] = await Promise.all([db.medicalRecord.count({ where: { patientId } }), db.medicalFile.count({ where: { patientId } })]);
  return { records, files };
}
