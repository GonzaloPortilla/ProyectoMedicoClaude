"use server";

import { withFormErrors } from "@/server/action-errors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formObject, zodFieldErrors, type FormState } from "@/lib/form";
import { doctorDecisionSchema, doctorStatusFilterSchema } from "@/features/admin/schemas";
import { authorizeRole } from "@/server/auth/dal";
import { db } from "@/server/db";
import { audit } from "@/server/audit/log";
import { requestContext } from "@/server/audit/request";

export const decideDoctorVerificationAction = withFormErrors("decideDoctorVerificationAction", async (_prev: FormState, formData: FormData): Promise<FormState> => {
  const admin = await authorizeRole("ADMIN");
  if (!admin) return { status: "error", message: "No tenés permiso para realizar esta acción." };

  const parsed = doctorDecisionSchema.safeParse(formObject(formData, ["doctorProfileId", "decision", "note"]));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };
  const { doctorProfileId, decision, note } = parsed.data;

  const profile = await db.doctorProfile.findUnique({
    where: { id: doctorProfileId },
    select: { id: true, userId: true, verificationStatus: true },
  });
  if (!profile) return { status: "error", message: "El profesional no existe." };
  // Separación de funciones: nadie verifica su propia matrícula.
  if (profile.userId === admin.id) return { status: "error", message: "No podés revisar tu propia solicitud." };
  if (profile.verificationStatus === decision) return { status: "success", message: "El estado ya estaba actualizado." };

  await db.$transaction([
    db.doctorProfile.update({
      where: { id: profile.id },
      data: { verificationStatus: decision, verifiedAt: decision === "VERIFIED" ? new Date() : null },
    }),
    db.doctorVerification.create({
      data: { doctorProfileId: profile.id, status: decision, note, reviewerId: admin.id },
    }),
  ]);

  await audit({ action: "DOCTOR_VERIFICATION_DECIDED", actorType: "ADMIN", actorUserId: admin.id, resourceType: "DOCTOR_PROFILE", resourceId: profile.id, metadata: { decision } }, await requestContext());
  revalidatePath("/admin", "layout");
  // La tarjeta puede desaparecer del filtro actual, así que el aviso se muestra a nivel de página.
  const returnTo = doctorStatusFilterSchema.parse(formData.get("returnTo"));
  redirect(`/admin/doctors?status=${returnTo}&notice=${decision === "VERIFIED" ? "verified" : "rejected"}`);
});
