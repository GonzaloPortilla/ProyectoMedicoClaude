"use server";

import { revalidatePath } from "next/cache";
import { formObject, safeValues, zodFieldErrors, type FormState } from "@/lib/form";
import { patientProfileSchema } from "@/features/patient/schemas";
import { authorizeRole } from "@/server/auth/dal";
import { db } from "@/server/db";

export async function updatePatientProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Autorización en el servidor: el usuario sale de la sesión, no del formulario.
  const user = await authorizeRole("PATIENT");
  if (!user) return { status: "error", message: "No tenés permiso para realizar esta acción." };

  const values = safeValues(formData);
  const parsed = patientProfileSchema.safeParse(
    formObject(formData, ["dateOfBirth", "sex", "documentId", "phone", "province", "city"]),
  );
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values };

  await db.patientProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...parsed.data },
    update: parsed.data,
  });

  revalidatePath("/patient", "layout");
  return { status: "success", message: "Perfil actualizado.", values };
}
