"use server";

import { withFormErrors } from "@/server/action-errors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formObject, safeValues, zodFieldErrors, type FormState } from "@/lib/form";
import { recordInputSchema } from "@/features/records/schemas";
import { authorizePatient } from "@/server/patient/context";
import { createRecord, deleteRecord } from "@/server/medical/records";
import { MAX_FILE_BYTES } from "@/server/files/validation";
import { requestContext } from "@/server/audit/request";

const FORBIDDEN: FormState = { status: "error", message: "No tenés permiso para realizar esta acción." };

export const createRecordAction = withFormErrors("createRecordAction", async (_prev: FormState, formData: FormData): Promise<FormState> => {
  const ctx = await authorizePatient();
  if (!ctx) return FORBIDDEN;

  const values = safeValues(formData);
  delete values.file;
  const parsed = recordInputSchema.safeParse(
    formObject(formData, ["title", "occurredOn", "categorySlug", "specialty", "institution", "professionalName", "description", "tags"]),
  );
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values };

  const file = formData.get("file");
  let upload = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) return { status: "error", fieldErrors: { file: ["El archivo supera el máximo de 15 MB."] }, values };
    upload = { name: file.name, size: file.size, bytes: new Uint8Array(await file.arrayBuffer()) };
  }

  const result = await createRecord(ctx.patientId, { userId: ctx.user.id, source: "PATIENT" }, parsed.data, upload, await requestContext());
  if (!result.ok) {
    return { status: "error", values, ...(result.field ? { fieldErrors: { [result.field]: [result.error] } } : { message: result.error }) };
  }
  revalidatePath("/patient", "layout");
  redirect(`/patient/documents/${result.data.recordId}?created=1`);
});

export async function deleteRecordAction(formData: FormData): Promise<void> {
  const ctx = await authorizePatient();
  if (!ctx) redirect("/login");
  const recordId = formData.get("recordId");
  if (typeof recordId !== "string" || recordId.length > 64) redirect("/patient/documents");
  // deleteRecord filtra por patientId: un id ajeno simplemente no se encuentra.
  const deleted = await deleteRecord(ctx.patientId, recordId, ctx.user.id, await requestContext());
  revalidatePath("/patient", "layout");
  redirect(deleted ? "/patient/documents?deleted=1" : "/patient/documents");
}
