import "server-only";
import type { DataSource } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import type { TimelineFilters } from "@/features/records/schemas";

/**
 * El historial combina los registros médicos con los datos fechados de "Mi Salud"
 * (cirugías, internaciones, vacunas), que se mapean a sus categorías equivalentes.
 * Se calcula al vuelo: no se duplica información en otra tabla.
 */
export type TimelineItem = {
  key: string;
  kind: "record" | "surgery" | "hospitalization" | "vaccination";
  date: Date;
  title: string;
  categorySlug: string;
  categoryName: string;
  specialty: string | null;
  institution: string | null;
  professional: string | null;
  fileCount: number;
  source: DataSource;
  href: string | null;
};

const HEALTH_CATEGORY = { surgery: "cirugias", hospitalization: "internaciones", vaccination: "vacunas" } as const;

function yearRange(year?: number) {
  return year ? { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } : undefined;
}

export async function getTimeline(patientId: string, filters: TimelineFilters): Promise<TimelineItem[]> {
  const categories = await db.medicalCategory.findMany({ select: { slug: true, name: true } });
  const catName = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? slug;
  const range = yearRange(filters.year);
  // Los datos de "Mi Salud" no tienen especialidad: si se filtra por especialidad, sólo aparecen registros.
  const includeHealth = (kind: keyof typeof HEALTH_CATEGORY) => !filters.specialty && (!filters.category || filters.category === HEALTH_CATEGORY[kind]);
  const instFilter = filters.institution ? { institutionId: filters.institution } : {};

  const [records, surgeries, hospitalizations, vaccinations] = await Promise.all([
    db.medicalRecord.findMany({
      where: {
        patientId,
        ...(range ? { occurredOn: range } : {}),
        ...(filters.category ? { category: { slug: filters.category } } : {}),
        ...(filters.specialty ? { specialty: filters.specialty } : {}),
        ...instFilter,
      },
      orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
      take: 500,
      select: {
        id: true,
        title: true,
        occurredOn: true,
        specialty: true,
        professionalName: true,
        source: true,
        category: { select: { slug: true, name: true } },
        institution: { select: { name: true } },
        _count: { select: { files: true } },
      },
    }),
    includeHealth("surgery")
      ? db.surgery.findMany({ where: { patientId, performedOn: range ?? { not: null }, ...instFilter }, include: { institution: { select: { name: true } } } })
      : [],
    includeHealth("hospitalization")
      ? db.hospitalization.findMany({ where: { patientId, admittedOn: range ?? { not: null }, ...instFilter }, include: { institution: { select: { name: true } } } })
      : [],
    includeHealth("vaccination") && !filters.institution ? db.vaccination.findMany({ where: { patientId, administeredOn: range ?? { not: null } } }) : [],
  ]);

  const items: TimelineItem[] = [
    ...records.map((r) => ({
      key: `record:${r.id}`,
      kind: "record" as const,
      date: r.occurredOn,
      title: r.title,
      categorySlug: r.category.slug,
      categoryName: r.category.name,
      specialty: r.specialty,
      institution: r.institution?.name ?? null,
      professional: r.professionalName,
      fileCount: r._count.files,
      source: r.source,
      href: `/patient/documents/${r.id}`,
    })),
    ...surgeries.map((x) => ({
      key: `surgery:${x.id}`,
      kind: "surgery" as const,
      date: x.performedOn!,
      title: x.name,
      categorySlug: HEALTH_CATEGORY.surgery,
      categoryName: catName(HEALTH_CATEGORY.surgery),
      specialty: null,
      institution: x.institution?.name ?? null,
      professional: null,
      fileCount: 0,
      source: x.source,
      href: "/patient/health#surgery",
    })),
    ...hospitalizations.map((x) => ({
      key: `hospitalization:${x.id}`,
      kind: "hospitalization" as const,
      date: x.admittedOn!,
      title: `Internación: ${x.reason}`,
      categorySlug: HEALTH_CATEGORY.hospitalization,
      categoryName: catName(HEALTH_CATEGORY.hospitalization),
      specialty: null,
      institution: x.institution?.name ?? null,
      professional: null,
      fileCount: 0,
      source: x.source,
      href: "/patient/health#hospitalization",
    })),
    ...vaccinations.map((x) => ({
      key: `vaccination:${x.id}`,
      kind: "vaccination" as const,
      date: x.administeredOn!,
      title: x.dose ? `${x.name} (${x.dose})` : x.name,
      categorySlug: HEALTH_CATEGORY.vaccination,
      categoryName: catName(HEALTH_CATEGORY.vaccination),
      specialty: null,
      institution: null,
      professional: null,
      fileCount: 0,
      source: x.source,
      href: "/patient/health#vaccination",
    })),
  ];

  return items.sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Opciones de filtro calculadas sólo con los datos del propio paciente. */
export async function getTimelineFilterOptions(patientId: string) {
  const [categories, specialties, institutions, years] = await Promise.all([
    db.medicalCategory.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }], select: { slug: true, name: true } }),
    db.medicalRecord.findMany({ where: { patientId, specialty: { not: null } }, distinct: ["specialty"], select: { specialty: true }, orderBy: { specialty: "asc" } }),
    db.institution.findMany({ where: { patientId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.$queryRaw<{ year: number }[]>`
      SELECT DISTINCT y::int AS year FROM (
        SELECT EXTRACT(YEAR FROM "occurredOn") AS y FROM medical_records WHERE "patientId" = ${patientId}
        UNION SELECT EXTRACT(YEAR FROM "performedOn") FROM surgeries WHERE "patientId" = ${patientId} AND "performedOn" IS NOT NULL
        UNION SELECT EXTRACT(YEAR FROM "admittedOn") FROM hospitalizations WHERE "patientId" = ${patientId} AND "admittedOn" IS NOT NULL
        UNION SELECT EXTRACT(YEAR FROM "administeredOn") FROM vaccinations WHERE "patientId" = ${patientId} AND "administeredOn" IS NOT NULL
      ) t ORDER BY year DESC`,
  ]);
  return {
    categories,
    specialties: specialties.map((s) => s.specialty!).filter(Boolean),
    institutions,
    years: years.map((y) => Number(y.year)),
  };
}
