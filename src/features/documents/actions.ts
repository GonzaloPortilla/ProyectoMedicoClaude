"use server";

import { after } from "next/server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withFormErrors } from "@/server/action-errors";
import { formObject, safeValues, zodFieldErrors, type FormState } from "@/lib/form";
import { authorizePatient } from "@/server/patient/context";
import { requestContext } from "@/server/audit/request";
import { createRecord, listActiveCategories } from "@/server/medical/records";
import { MAX_FILE_BYTES } from "@/server/files/validation";
import { analyzeMetadata, findDates } from "@/server/documents/analysis/metadata";
import { findDuplicateFile } from "@/server/documents/duplicates";
import { processDocumentSafely } from "@/server/documents/process";
import { confirmDocumentDetails, requestAnalysis, reviewMeasurements, updateMeasurement } from "@/server/documents/review";
import { documentDetailsSchema, measurementEditSchema, SHA256_RE } from "@/features/documents/schemas";
import { parseDateOnly } from "@/lib/text";

const FORBIDDEN: FormState = { status: "error", message: "No tenés permiso para realizar esta acción." };

export type DuplicateCheck = { duplicate: { recordId: string; title: string; occurredOn: string } | null };

/**
 * Antes de subir: ¿este paciente ya cargó un archivo idéntico? El hash se calcula en el
 * navegador, así el archivo no viaja dos veces. Sólo compara contra SUS archivos.
 */
export async function checkDuplicateAction(sha256: string): Promise<DuplicateCheck> {
  const ctx = await authorizePatient();
  if (!ctx || typeof sha256 !== "string" || !SHA256_RE.test(sha256)) return { duplicate: null };
  const dup = await findDuplicateFile(ctx.patientId, sha256);
  return { duplicate: dup ? { recordId: dup.recordId, title: dup.title, occurredOn: dup.occurredOn.toISOString().slice(0, 10) } : null };
}

async function readUpload(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Elegí un archivo PDF, JPG o PNG." } as const;
  if (file.size > MAX_FILE_BYTES) return { error: "El archivo supera el máximo de 15 MB." } as const;
  return { upload: { name: file.name, size: file.size, bytes: new Uint8Array(await file.arrayBuffer()) } } as const;
}

/**
 * Carga rápida: sólo el archivo. Se guarda de inmediato con datos provisorios (tomados del
 * nombre del archivo) y el análisis corre en segundo plano. El paciente revisa la propuesta.
 */
export const uploadDocumentAction = withFormErrors("uploadDocumentAction", async (_prev: FormState, formData: FormData): Promise<FormState> => {
  const ctx = await authorizePatient();
  if (!ctx) return FORBIDDEN;
  const read = await readUpload(formData);
  if ("error" in read) return { status: "error", fieldErrors: { file: [read.error!] } };
  const { upload } = read;
  if (formData.get("allowDuplicate") !== "1") {
    const dup = await findDuplicateFile(ctx.patientId, createHash("sha256").update(upload.bytes).digest("hex"));
    if (dup) return { status: "error", fieldErrors: { file: [`Este archivo parece estar cargado anteriormente («${dup.title}»). Elegilo de nuevo y tocá «Cargar igualmente» si querés guardarlo otra vez.`] } };
  }

  const categories = await listActiveCategories();
  const guess = analyzeMetadata({ text: "", filename: upload.name, categories: categories.map((c) => c.slug), labResultCount: 0 });
  const today = new Date().toISOString().slice(0, 10);
  const occurredOn = parseDateOnly(findDates(upload.name.replace(/_/g, "-"))[0] ?? today)!;

  const result = await createRecord(
    ctx.patientId,
    { userId: ctx.user.id, source: "PATIENT" },
    {
      title: guess.title?.value ?? null,
      occurredOn,
      categorySlug: guess.categorySlug?.value ?? "otros",
      specialty: null,
      institution: null,
      professionalName: null,
      description: null,
      tags: [],
    },
    upload,
    await requestContext(),
    { analyze: true, metadataReviewed: false },
  );
  if (!result.ok) return { status: "error", ...(result.field === "file" ? { fieldErrors: { file: [result.error] } } : { message: result.error }) };
  const fileId = result.data.fileId;
  if (fileId) after(() => processDocumentSafely(fileId));
  revalidatePath("/patient", "layout");
  redirect(`/patient/documents/${result.data.recordId}/review`);
});

/** Paso de revisión: el paciente confirma o corrige los datos propuestos del estudio. */
export const confirmDocumentDetailsAction = withFormErrors("confirmDocumentDetailsAction", async (_prev: FormState, formData: FormData): Promise<FormState> => {
  const ctx = await authorizePatient();
  if (!ctx) return FORBIDDEN;
  const values = safeValues(formData);
  const recordId = formData.get("recordId");
  if (typeof recordId !== "string" || recordId.length > 64) return FORBIDDEN;
  const parsed = documentDetailsSchema.safeParse(formObject(formData, ["title", "occurredOn", "categorySlug", "specialty", "institution", "professionalName"]));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values };
  const result = await confirmDocumentDetails(ctx.patientId, ctx.user.id, recordId, parsed.data, await requestContext());
  if (!result.ok) return { status: "error", values, ...("field" in result && result.field ? { fieldErrors: { [result.field]: [result.error] } } : { message: result.error }) };
  revalidatePath("/patient", "layout");
  redirect(`/patient/documents/${recordId}/review?saved=details`);
});

/** Confirmar / descartar / restaurar resultados (uno o todos los pendientes). */
export async function reviewMeasurementsAction(formData: FormData): Promise<void> {
  const ctx = await authorizePatient();
  if (!ctx) redirect("/login");
  const recordId = formData.get("recordId");
  const to = formData.get("to");
  const scope = formData.get("scope");
  if (typeof recordId !== "string" || recordId.length > 64) redirect("/patient/documents");
  if (to !== "CONFIRMED" && to !== "DISCARDED" && to !== "PENDING") redirect(`/patient/documents/${recordId}/review`);
  const ids = scope === "all-pending" ? ("all-pending" as const) : formData.getAll("measurementId").filter((v): v is string => typeof v === "string" && v.length <= 64);
  const count = await reviewMeasurements(ctx.patientId, ctx.user.id, recordId, { ids, to }, await requestContext());
  revalidatePath("/patient", "layout");
  const back = formData.get("back") === "record" ? `/patient/documents/${recordId}` : `/patient/documents/${recordId}/review`;
  redirect(`${back}?saved=${count ? to.toLowerCase() : "none"}#resultados`);
}

/** Corregir un resultado (guardar = confirmar). */
export const updateMeasurementAction = withFormErrors("updateMeasurementAction", async (_prev: FormState, formData: FormData): Promise<FormState> => {
  const ctx = await authorizePatient();
  if (!ctx) return FORBIDDEN;
  const values = safeValues(formData);
  const parsed = measurementEditSchema.safeParse(formObject(formData, ["measurementId", "conceptCode", "valueText", "unit", "refLow", "refHigh"]));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values };
  const { measurementId, ...input } = parsed.data;
  const result = await updateMeasurement(ctx.patientId, ctx.user.id, measurementId, input, await requestContext());
  if (!result.ok) return { status: "error", values, ...("field" in result && result.field ? { fieldErrors: { [result.field]: [result.error] } } : { message: result.error }) };
  revalidatePath("/patient", "layout");
  return { status: "success", message: "Resultado corregido y confirmado." };
});

/** Analizar un estudio anterior o reintentar un análisis que falló. */
export async function analyzeRecordAction(formData: FormData): Promise<void> {
  const ctx = await authorizePatient();
  if (!ctx) redirect("/login");
  const recordId = formData.get("recordId");
  if (typeof recordId !== "string" || recordId.length > 64) redirect("/patient/documents");
  const fileId = await requestAnalysis(ctx.patientId, recordId);
  if (fileId) after(() => processDocumentSafely(fileId));
  revalidatePath("/patient", "layout");
  redirect(`/patient/documents/${recordId}/review`);
}
