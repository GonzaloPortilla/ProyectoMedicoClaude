"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { zodFieldErrors, type FormState } from "@/lib/form";
import { accessRequestSchema, approveRequestSchema, reportCorrectionSchema, reportSchema } from "@/features/access/schemas";
import { computeExpiry, type DurationValue } from "@/features/access/resources";
import { authorizePatient } from "@/server/patient/context";
import { authorizeVerifiedDoctor } from "@/server/doctor/context";
import { cancelLinkCodes, generateLinkCode } from "@/server/access/codes";
import { approveRequest, cancelRequest, createAccessRequest, rejectRequest, revokeGrant } from "@/server/access/requests";
import { getDoctorAccess } from "@/server/access/policy";
import { correctReport, createReport } from "@/server/medical/reports";
import { limiters } from "@/server/auth/rate-limit";
import { MAX_FILE_BYTES } from "@/server/files/validation";
import { audit } from "@/server/audit/log";
import { requestContext } from "@/server/audit/request";

const FORBIDDEN: FormState = { status: "error", message: "No tenés permiso para realizar esta acción." };
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

// ─── Paciente ──────────────────────────────────────────────────────────────

export type LinkCodeState = { code?: string; expiresAt?: string; error?: string };

export async function generateLinkCodeAction(): Promise<LinkCodeState> {
  const ctx = await authorizePatient();
  if (!ctx) return { error: "No tenés permiso para realizar esta acción." };
  const { code, expiresAt } = await generateLinkCode(ctx.patientId);
  // Se registra la creación, nunca el código.
  await audit({ action: "LINK_CODE_CREATED", actorType: "PATIENT", actorUserId: ctx.user.id, subjectPatientId: ctx.patientId, resourceType: "LINK_CODE" }, await requestContext());
  revalidatePath("/patient/doctors");
  return { code, expiresAt: expiresAt.toISOString() };
}

export async function cancelLinkCodeAction(): Promise<LinkCodeState> {
  const ctx = await authorizePatient();
  if (!ctx) return { error: "No tenés permiso para realizar esta acción." };
  await cancelLinkCodes(ctx.patientId);
  revalidatePath("/patient/doctors");
  return {};
}

export async function rejectRequestAction(formData: FormData): Promise<void> {
  const ctx = await authorizePatient();
  if (!ctx) redirect("/login");
  await rejectRequest(ctx.patientId, str(formData.get("requestId")).slice(0, 64), ctx.user.id, await requestContext());
  revalidatePath("/patient", "layout");
  redirect("/patient/doctors?rejected=1");
}

export async function approveRequestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await authorizePatient();
  if (!ctx) return FORBIDDEN;
  const parsed = approveRequestSchema.safeParse({
    requestId: str(formData.get("requestId")),
    resources: formData.getAll("resources").map(String),
    allowCreate: formData.get("allowCreate") === "on",
    allowUpload: formData.get("allowUpload") === "on",
    duration: str(formData.get("duration")),
    customDate: str(formData.get("customDate")) || null,
  });
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };
  const expiresAt = computeExpiry(parsed.data.duration as DurationValue, parsed.data.customDate ?? null);
  if (expiresAt === "invalid") return { status: "error", fieldErrors: { customDate: ["Elegí una fecha futura (máximo 2 años)"] } };

  const result = await approveRequest(ctx.patientId, ctx.user.id, parsed.data.requestId, { ...parsed.data, expiresAt }, await requestContext());
  if (!result.ok) return { status: "error", ...(result.field ? { fieldErrors: { [result.field]: [result.error] } } : { message: result.error }) };
  revalidatePath("/patient", "layout");
  redirect("/patient/doctors?approved=1");
}

export async function revokeGrantAction(formData: FormData): Promise<void> {
  const ctx = await authorizePatient();
  if (!ctx) redirect("/login");
  const ok = await revokeGrant(ctx.patientId, ctx.user.id, str(formData.get("grantId")).slice(0, 64), await requestContext());
  revalidatePath("/patient", "layout");
  redirect(ok ? "/patient/doctors?revoked=1" : "/patient/doctors");
}

// ─── Médico ────────────────────────────────────────────────────────────────

export async function requestAccessAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const doctor = await authorizeVerifiedDoctor();
  if (!doctor) return FORBIDDEN;
  const values = { code: str(formData.get("code")).slice(0, 20), message: str(formData.get("message")).slice(0, 300) };
  const parsed = accessRequestSchema.safeParse({ code: values.code, message: values.message, requested: formData.getAll("requested").map(String) });
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values };

  if (!limiters.linkCode.consume(doctor.id).allowed) {
    return { status: "error", message: "Demasiados intentos. Esperá unos minutos y volvé a probar.", values };
  }
  const result = await createAccessRequest(doctor.id, parsed.data, await requestContext());
  if (!result.ok) return { status: "error", values, ...(result.field ? { fieldErrors: { [result.field]: [result.error] } } : { message: result.error }) };
  revalidatePath("/doctor");
  return { status: "success", message: "Solicitud enviada. El paciente la verá en “Mis médicos” para aceptarla y elegir qué compartir." };
}

export async function cancelRequestAction(formData: FormData): Promise<void> {
  const doctor = await authorizeVerifiedDoctor();
  if (!doctor) redirect("/login");
  await cancelRequest(doctor.id, str(formData.get("requestId")).slice(0, 64), await requestContext());
  revalidatePath("/doctor");
}

export async function createReportAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const doctor = await authorizeVerifiedDoctor();
  if (!doctor) return FORBIDDEN;
  const patientId = str(formData.get("patientId")).slice(0, 64);
  // El acceso se vuelve a validar en el servidor: el patientId del formulario no otorga nada por sí mismo.
  const access = await getDoctorAccess(doctor.id, patientId);
  if (!access) return { status: "error", message: "No tenés un acceso vigente a este paciente." };

  const values = { categorySlug: str(formData.get("categorySlug")), title: str(formData.get("title")).slice(0, 200), content: str(formData.get("content")).slice(0, 20000) };
  const parsed = reportSchema.safeParse(values);
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values };

  const file = formData.get("file");
  let upload = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) return { status: "error", fieldErrors: { file: ["El archivo supera el máximo de 15 MB."] }, values };
    upload = { name: file.name, size: file.size, bytes: new Uint8Array(await file.arrayBuffer()) };
  }
  const result = await createReport(access, parsed.data, upload, await requestContext());
  if (!result.ok) return { status: "error", values, ...(result.field ? { fieldErrors: { [result.field]: [result.error] } } : { message: result.error }) };
  revalidatePath(`/doctor/patients/${patientId}`, "layout");
  redirect(`/doctor/patients/${patientId}/records/${result.data.recordId}?created=1`);
}

export async function correctReportAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const doctor = await authorizeVerifiedDoctor();
  if (!doctor) return FORBIDDEN;
  const patientId = str(formData.get("patientId")).slice(0, 64);
  const access = await getDoctorAccess(doctor.id, patientId);
  if (!access) return { status: "error", message: "No tenés un acceso vigente a este paciente." };

  const values = { reportId: str(formData.get("reportId")), title: str(formData.get("title")).slice(0, 200), content: str(formData.get("content")).slice(0, 20000), changeReason: str(formData.get("changeReason")).slice(0, 300) };
  const parsed = reportCorrectionSchema.safeParse(values);
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values };
  const result = await correctReport(access, parsed.data, await requestContext());
  if (!result.ok) return { status: "error", message: result.error, values };
  revalidatePath(`/doctor/patients/${patientId}`, "layout");
  redirect(`/doctor/patients/${patientId}/records/${result.data.recordId}?corrected=${result.data.version}`);
}
