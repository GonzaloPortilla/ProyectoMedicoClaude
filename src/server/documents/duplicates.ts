import "server-only";
import { db } from "@/server/db";
import { normalizeText } from "@/lib/text";

/**
 * Detección de duplicados. Nunca borra nada: sólo avisa y deja decidir al paciente.
 * Todas las consultas filtran por el patientId de la sesión.
 */

export type DuplicateRef = { recordId: string; title: string; occurredOn: Date; reason: "same_file" | "same_details" };

/** ¿Este paciente ya subió un archivo con exactamente el mismo contenido? */
export async function findDuplicateFile(patientId: string, sha256: string): Promise<DuplicateRef | null> {
  if (!/^[a-f0-9]{64}$/.test(sha256)) return null;
  const file = await db.medicalFile.findFirst({
    where: { patientId, OR: [{ originalSha256: sha256 }, { sha256 }] },
    orderBy: { createdAt: "asc" },
    select: { record: { select: { id: true, title: true, occurredOn: true } } },
  });
  return file ? { recordId: file.record.id, title: file.record.title, occurredOn: file.record.occurredOn, reason: "same_file" } : null;
}

function similarTitle(a: string, b: string) {
  const words = (s: string) => new Set(normalizeText(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return false;
  const common = [...wa].filter((w) => wb.has(w)).length;
  return common / Math.min(wa.size, wb.size) >= 0.6;
}

/**
 * Posibles duplicados por datos: misma fecha y además misma institución, mismo tipo de
 * estudio o un título parecido. Sirve para archivos distintos del mismo estudio (otra foto, otro PDF).
 */
export async function findPossibleDuplicates(patientId: string, record: { id: string; title: string; occurredOn: Date; categoryId: string; institutionId: string | null }): Promise<DuplicateRef[]> {
  const sameDay = await db.medicalRecord.findMany({
    where: { patientId, occurredOn: record.occurredOn, id: { not: record.id } },
    select: { id: true, title: true, occurredOn: true, categoryId: true, institutionId: true },
    take: 20,
  });
  return sameDay
    .filter((r) => (record.institutionId && r.institutionId === record.institutionId) || (r.categoryId === record.categoryId && similarTitle(r.title, record.title)) || similarTitle(r.title, record.title))
    .slice(0, 5)
    .map((r) => ({ recordId: r.id, title: r.title, occurredOn: r.occurredOn, reason: "same_details" as const }));
}
