"use server";

import { revalidatePath } from "next/cache";
import { safeValues, zodFieldErrors, type FormState } from "@/lib/form";
import { KIND_CONFIG } from "@/features/health/config";
import { emergencySettingsSchema, healthKindSchema, KIND_SCHEMAS, vitalsSchema } from "@/features/health/schemas";
import { authorizePatient } from "@/server/patient/context";
import { addHealthEntry, deleteHealthEntry } from "@/server/medical/health";
import { db } from "@/server/db";

const FORBIDDEN: FormState = { status: "error", message: "No tenés permiso para realizar esta acción." };

function revalidate() {
  revalidatePath("/patient", "layout");
}

export async function addHealthEntryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorizePatient();
  if (!ctx) return FORBIDDEN;
  const kind = healthKindSchema.safeParse(formData.get("kind"));
  if (!kind.success) return { status: "error", message: "Tipo de dato no válido." };

  // Los campos llegan prefijados con el tipo (p. ej. "allergy-name") para que los ids sean únicos en la página.
  const raw = Object.fromEntries(
    KIND_CONFIG[kind.data].fields.map((f) => {
      const value = formData.get(`${kind.data}-${f.name}`);
      return [f.name, typeof value === "string" ? value : undefined];
    }),
  );
  const parsed = KIND_SCHEMAS[kind.data].safeParse(raw);
  if (!parsed.success) {
    const values = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, (v ?? "").slice(0, 500)]));
    return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values };
  }

  await addHealthEntry(ctx.patientId, { userId: ctx.user.id, source: "PATIENT" }, kind.data, parsed.data);
  revalidate();
  return { status: "success", message: "Guardado." };
}

export async function deleteHealthEntryAction(formData: FormData): Promise<void> {
  const ctx = await authorizePatient();
  if (!ctx) return;
  const kind = healthKindSchema.safeParse(formData.get("kind"));
  const id = formData.get("id");
  if (!kind.success || typeof id !== "string" || id.length > 64) return;
  await deleteHealthEntry(ctx.patientId, kind.data, id);
  revalidate();
}

export async function saveVitalsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorizePatient();
  if (!ctx) return FORBIDDEN;
  const parsed = vitalsSchema.safeParse({
    bloodType: formData.get("bloodType") ?? "",
    heightCm: formData.get("heightCm") ?? "",
    weightKg: formData.get("weightKg") ?? "",
  });
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values: safeValues(formData) };
  await db.healthProfile.upsert({ where: { patientId: ctx.patientId }, create: { patientId: ctx.patientId, ...parsed.data }, update: parsed.data });
  revalidate();
  return { status: "success", message: "Datos actualizados." };
}

export async function saveEmergencySettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorizePatient();
  if (!ctx) return FORBIDDEN;
  const keys = ["showBloodType", "showAllergies", "showConditions", "showMedications", "showEmergencyContacts", "additionalNotes"] as const;
  const parsed = emergencySettingsSchema.safeParse(Object.fromEntries(keys.map((k) => [k, formData.get(k) ?? undefined])));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };
  await db.emergencyProfile.upsert({ where: { patientId: ctx.patientId }, create: { patientId: ctx.patientId, ...parsed.data }, update: parsed.data });
  revalidate();
  return { status: "success", message: "Preferencias de emergencia guardadas." };
}
