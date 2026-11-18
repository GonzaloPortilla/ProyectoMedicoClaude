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
import { after } from "next/server";
import { createHash } from "node:crypto";
import { findDuplicateFile } from "@/server/documents/duplicates";
import { processDocumentSafely } from "@/server/documents/process";

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
    // Respaldo del aviso del navegador: nunca se carga dos veces el mismo archivo sin confirmarlo.
    if (formData.get("allowDuplicate") !== "1") {
      const dup = await findDuplicateFile(ctx.patientId, createHash("sha256").update(upload.bytes).digest("hex"));
      if (dup) return { status: "error", values, fieldErrors: { file: [`Este archivo parece estar cargado anteriormente («${dup.title}»). Elegilo de nuevo y tocá «Cargar igualmente» si querés guardarlo otra vez.`] } };
    }
  }

  // Los datos ya los completó el paciente: el análisis sólo busca resultados.
  const result = await createRecord(ctx.patientId, { userId: ctx.user.id, source: "PATIENT" }, parsed.data, upload, await requestContext(), { analyze: true, metadataReviewed: true });
  if (!result.ok) {
    return { status: "error", values, ...(result.field ? { fieldErrors: { [result.field]: [result.error] } } : { message: result.error }) };
  }
  const fileId = result.data.fileId;
  if (fileId) after(() => processDocumentSafely(fileId));
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
