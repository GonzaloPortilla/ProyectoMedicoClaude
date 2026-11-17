import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { HealthKind } from "@/features/health/config";
import { db } from "@/server/db";
import { upsertInstitution } from "@/server/medical/institutions";
import type { Actor } from "@/server/medical/records";

type Data = Record<string, unknown>;
const s = (v: unknown) => (v ?? null) as string | null;
const d = (v: unknown) => (v ?? null) as Date | null;

/** Alta de un dato de "Mi Salud". `data` ya fue validado con KIND_SCHEMAS[kind]. */
export async function addHealthEntry(patientId: string, actor: Actor, kind: HealthKind, data: Data): Promise<void> {
  const meta = { patientId, source: actor.source, createdById: actor.userId };
  switch (kind) {
    case "allergy":
      await db.allergy.create({ data: { ...meta, name: data.name as string, severity: data.severity as Prisma.AllergyCreateInput["severity"], reaction: s(data.reaction) } });
      return;
    case "condition":
      await db.condition.create({ data: { ...meta, name: data.name as string, status: data.status as Prisma.ConditionCreateInput["status"], diagnosedOn: d(data.diagnosedOn), notes: s(data.notes) } });
      return;
    case "medication":
      await db.medication.create({ data: { ...meta, name: data.name as string, dosage: s(data.dosage), frequency: s(data.frequency), startedOn: d(data.startedOn) } });
      return;
    case "surgery":
      await db.$transaction(async (tx) => {
        const inst = await upsertInstitution(tx, patientId, s(data.institution));
        await tx.surgery.create({ data: { ...meta, name: data.name as string, performedOn: d(data.performedOn), institutionId: inst?.id ?? null, notes: s(data.notes) } });
      });
      return;
    case "hospitalization":
      await db.$transaction(async (tx) => {
        const inst = await upsertInstitution(tx, patientId, s(data.institution));
        await tx.hospitalization.create({ data: { ...meta, reason: data.reason as string, admittedOn: d(data.admittedOn), dischargedOn: d(data.dischargedOn), institutionId: inst?.id ?? null } });
      });
      return;
    case "vaccination":
      await db.vaccination.create({ data: { ...meta, name: data.name as string, dose: s(data.dose), administeredOn: d(data.administeredOn) } });
      return;
    case "familyHistory":
      await db.familyHistory.create({ data: { ...meta, relationship: data.relationship as string, condition: data.condition as string, notes: s(data.notes) } });
      return;
    case "emergencyContact":
      await db.emergencyContact.create({ data: { patientId, name: data.name as string, relationship: s(data.relationship), phone: data.phone as string } });
      return;
  }
}

/** Borra un dato sólo si pertenece al paciente (deleteMany con patientId como filtro). */
export async function deleteHealthEntry(patientId: string, kind: HealthKind, id: string): Promise<boolean> {
  const where = { id, patientId };
  const delegates = {
    allergy: () => db.allergy.deleteMany({ where }),
    condition: () => db.condition.deleteMany({ where }),
    medication: () => db.medication.deleteMany({ where }),
    surgery: () => db.surgery.deleteMany({ where }),
    hospitalization: () => db.hospitalization.deleteMany({ where }),
    vaccination: () => db.vaccination.deleteMany({ where }),
    familyHistory: () => db.familyHistory.deleteMany({ where }),
    emergencyContact: () => db.emergencyContact.deleteMany({ where }),
  } satisfies Record<HealthKind, () => Promise<{ count: number }>>;
  const { count } = await delegates[kind]();
  return count > 0;
}

const byDateDesc = { createdAt: "desc" } as const;
const inst = { select: { name: true } } as const;

export async function getHealthOverview(patientId: string) {
  const [vitals, emergency, allergies, conditions, medications, surgeries, hospitalizations, vaccinations, familyHistory, emergencyContacts] = await Promise.all([
    db.healthProfile.findUnique({ where: { patientId }, select: { bloodType: true, heightCm: true, weightKg: true, updatedAt: true } }),
    db.emergencyProfile.findUnique({ where: { patientId } }),
    db.allergy.findMany({ where: { patientId }, orderBy: byDateDesc }),
    db.condition.findMany({ where: { patientId }, orderBy: [{ status: "asc" }, byDateDesc] }),
    db.medication.findMany({ where: { patientId }, orderBy: byDateDesc }),
    db.surgery.findMany({ where: { patientId }, orderBy: [{ performedOn: { sort: "desc", nulls: "last" } }, byDateDesc], include: { institution: inst } }),
    db.hospitalization.findMany({ where: { patientId }, orderBy: [{ admittedOn: { sort: "desc", nulls: "last" } }, byDateDesc], include: { institution: inst } }),
    db.vaccination.findMany({ where: { patientId }, orderBy: [{ administeredOn: { sort: "desc", nulls: "last" } }, byDateDesc] }),
    db.familyHistory.findMany({ where: { patientId }, orderBy: byDateDesc }),
    db.emergencyContact.findMany({ where: { patientId }, orderBy: { createdAt: "asc" } }),
  ]);
  return { vitals, emergency, allergies, conditions, medications, surgeries, hospitalizations, vaccinations, familyHistory, emergencyContacts };
}

export type HealthOverview = Awaited<ReturnType<typeof getHealthOverview>>;
