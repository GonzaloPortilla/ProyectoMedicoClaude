import "server-only";
import { db } from "@/server/db";
import { normalizeText } from "@/lib/text";

/**
 * Búsqueda (sin IA) sobre la información del propio paciente.
 * - Registros: todos los términos deben aparecer en `searchText` (título, categoría,
 *   especialidad, institución, profesional, tags, descripción, nombre de archivo),
 *   sin distinguir mayúsculas ni acentos.
 * - Datos de "Mi Salud": coincidencia parcial por nombre.
 */
export async function searchPatientData(patientId: string, rawQuery: string) {
  const query = rawQuery.trim().slice(0, 100);
  const terms = normalizeText(query).split(" ").filter((t) => t.length >= 2).slice(0, 6);
  if (terms.length === 0) return null;

  const contains = (field: string) => ({ [field]: { contains: query, mode: "insensitive" as const } });
  const take = 20;

  const [records, allergies, conditions, medications, surgeries, hospitalizations, vaccinations, familyHistory] = await Promise.all([
    db.medicalRecord.findMany({
      where: { patientId, AND: terms.map((t) => ({ searchText: { contains: t } })) },
      orderBy: { occurredOn: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        occurredOn: true,
        specialty: true,
        professionalName: true,
        description: true,
        tags: true,
        category: { select: { name: true } },
        institution: { select: { name: true } },
        _count: { select: { files: true } },
      },
    }),
    db.allergy.findMany({ where: { patientId, OR: [contains("name"), contains("reaction")] }, take }),
    db.condition.findMany({ where: { patientId, OR: [contains("name"), contains("notes")] }, take }),
    db.medication.findMany({ where: { patientId, OR: [contains("name"), contains("notes")] }, take }),
    db.surgery.findMany({ where: { patientId, OR: [contains("name"), contains("notes"), { institution: contains("name") }] }, take }),
    db.hospitalization.findMany({ where: { patientId, OR: [contains("reason"), contains("notes"), { institution: contains("name") }] }, take }),
    db.vaccination.findMany({ where: { patientId, OR: [contains("name"), contains("dose")] }, take }),
    db.familyHistory.findMany({ where: { patientId, OR: [contains("condition"), contains("relationship")] }, take }),
  ]);

  const health = [
    ...allergies.map((x) => ({ key: `a:${x.id}`, section: "Alergias", anchor: "allergy", title: x.name, detail: x.reaction })),
    ...conditions.map((x) => ({ key: `c:${x.id}`, section: "Condiciones", anchor: "condition", title: x.name, detail: x.notes })),
    ...medications.map((x) => ({ key: `m:${x.id}`, section: "Medicación", anchor: "medication", title: x.name, detail: [x.dosage, x.frequency].filter(Boolean).join(" · ") || null })),
    ...surgeries.map((x) => ({ key: `s:${x.id}`, section: "Cirugías", anchor: "surgery", title: x.name, detail: x.notes })),
    ...hospitalizations.map((x) => ({ key: `h:${x.id}`, section: "Internaciones", anchor: "hospitalization", title: x.reason, detail: x.notes })),
    ...vaccinations.map((x) => ({ key: `v:${x.id}`, section: "Vacunas", anchor: "vaccination", title: x.name, detail: x.dose })),
    ...familyHistory.map((x) => ({ key: `f:${x.id}`, section: "Antecedentes familiares", anchor: "familyHistory", title: x.condition, detail: x.relationship })),
  ];

  return { query, records, health, total: records.length + health.length };
}
