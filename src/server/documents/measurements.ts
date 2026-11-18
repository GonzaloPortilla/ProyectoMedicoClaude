import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { viewableCategories, type DoctorAccess } from "@/server/access/policy";

/**
 * Lecturas de mediciones para "Evolución".
 *
 * - Sólo resultados CONFIRMADOS por el paciente (lo pendiente o descartado no es definitivo).
 * - Para un médico, sólo los que provienen de registros de categorías con permiso VIEW:
 *   el filtro está en la consulta, así que lo no autorizado nunca sale de la base.
 */

type Scope = { patientId: string; allowedCategories?: readonly string[] };

function scopeWhere({ patientId, allowedCategories }: Scope): Prisma.MedicalMeasurementWhereInput {
  return {
    patientId,
    reviewStatus: "CONFIRMED",
    ...(allowedCategories ? { record: { category: { slug: { in: [...allowedCategories] } } } } : {}),
  };
}

export type IndicatorSummary = {
  key: string;
  name: string;
  count: number;
  lastValue: string;
  lastUnit: string | null;
  lastDate: Date;
};

export async function listIndicators(scope: Scope): Promise<IndicatorSummary[]> {
  if (scope.allowedCategories && scope.allowedCategories.length === 0) return [];
  const rows = await db.medicalMeasurement.findMany({
    where: scopeWhere(scope),
    orderBy: [{ measuredOn: "desc" }, { createdAt: "desc" }],
    take: 5000,
    select: { normalizedKey: true, originalName: true, valueText: true, unit: true, measuredOn: true, concept: { select: { displayName: true } } },
  });
  const map = new Map<string, IndicatorSummary>();
  for (const r of rows) {
    const existing = map.get(r.normalizedKey);
    if (existing) existing.count++;
    else map.set(r.normalizedKey, { key: r.normalizedKey, name: r.concept?.displayName ?? r.originalName, count: 1, lastValue: r.valueText, lastUnit: r.unit, lastDate: r.measuredOn });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
}

export async function getIndicatorSeries(scope: Scope, key: string) {
  if (!key || key.length > 100) return [];
  if (scope.allowedCategories && scope.allowedCategories.length === 0) return [];
  return db.medicalMeasurement.findMany({
    where: { ...scopeWhere(scope), normalizedKey: key },
    orderBy: [{ measuredOn: "asc" }, { createdAt: "asc" }],
    take: 500,
    select: {
      id: true,
      originalName: true,
      valueText: true,
      valueNumeric: true,
      unit: true,
      refLow: true,
      refHigh: true,
      refText: true,
      documentFlag: true,
      measuredOn: true,
      extractionMethod: true,
      editedAt: true,
      confirmedAt: true,
      fileId: true,
      concept: { select: { displayName: true } },
      confirmedBy: { select: { firstName: true, lastName: true } },
      institution: { select: { name: true } },
      record: { select: { id: true, title: true, institution: { select: { name: true } } } },
    },
  });
}

export type SeriesPoint = Awaited<ReturnType<typeof getIndicatorSeries>>[number];

/** Versiones para un médico: sólo categorías con permiso VIEW en el acceso vigente. */
export function listIndicatorsForDoctor(access: DoctorAccess) {
  return listIndicators({ patientId: access.patientId, allowedCategories: viewableCategories(access) });
}

export function getIndicatorSeriesForDoctor(access: DoctorAccess, key: string) {
  return getIndicatorSeries({ patientId: access.patientId, allowedCategories: viewableCategories(access) }, key);
}

/** Cuántos resultados esperan revisión (para el inicio del paciente). */
export async function countPendingReview(patientId: string) {
  const [documents, results] = await Promise.all([
    db.documentExtraction.count({ where: { patientId, status: "READY_FOR_REVIEW" } }),
    db.medicalMeasurement.count({ where: { patientId, reviewStatus: "PENDING" } }),
  ]);
  return { documents, results };
}
