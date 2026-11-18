"use server";

import { revalidatePath } from "next/cache";
import { formObject, safeValues, zodFieldErrors, type FormState } from "@/lib/form";
import { patientProfileSchema } from "@/features/patient/schemas";
import { authorizeRole } from "@/server/auth/dal";
import { db } from "@/server/db";
import { audit } from "@/server/audit/log";
import { requestContext } from "@/server/audit/request";

export async function updatePatientProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Autorización en el servidor: el usuario sale de la sesión, no del formulario.
  const user = await authorizeRole("PATIENT");
  if (!user) return { status: "error", message: "No tenés permiso para realizar esta acción." };

  const values = safeValues(formData);
  const parsed = patientProfileSchema.safeParse(
    formObject(formData, ["dateOfBirth", "sex", "documentId", "phone", "province", "city"]),
  );
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values };

  const before = await db.patientProfile.findUnique({ where: { userId: user.id }, select: { id: true, dateOfBirth: true, sex: true, documentId: true, phone: true, province: true, city: true } });
  const saved = await db.patientProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...parsed.data },
    update: parsed.data,
    select: { id: true },
  });
  // Se registran QUÉ campos cambiaron, nunca sus valores.
  const changed = (Object.keys(parsed.data) as (keyof typeof parsed.data)[]).filter((k) => {
    const prev = before?.[k] ?? null;
    const next = parsed.data[k] ?? null;
    return (prev instanceof Date ? prev.toISOString() : prev) !== (next instanceof Date ? next.toISOString() : next);
  });
  if (changed.length) {
    await audit({ action: "PROFILE_UPDATED", actorType: "PATIENT", actorUserId: user.id, subjectPatientId: saved.id, resourceType: "PATIENT_PROFILE", resourceId: saved.id, metadata: { fields: changed } }, await requestContext());
  }

  revalidatePath("/patient", "layout");
  return { status: "success", message: "Perfil actualizado.", values };
}
