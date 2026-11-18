"use server";

import { withFormErrors } from "@/server/action-errors";
import { revalidatePath } from "next/cache";
import { zodFieldErrors, type FormState } from "@/lib/form";
import { changePasswordSchema, mfaCodeSchema, profileNameSchema } from "@/features/auth/schemas";
import { getCurrentSession } from "@/server/auth/dal";
import { changePassword } from "@/server/auth/service";
import { beginMfaSetup, confirmMfaSetup, disableMfa } from "@/server/auth/mfa";
import { invalidateAllUserSessions, revokeUserSession } from "@/server/auth/session";
import { limiters } from "@/server/auth/rate-limit";
import { actorTypeFor, audit } from "@/server/audit/log";
import { requestContext } from "@/server/audit/request";
import { db } from "@/server/db";

const FORBIDDEN: FormState = { status: "error", message: "Tu sesión venció. Volvé a ingresar." };
const TOO_MANY: FormState = { status: "error", message: "Demasiados intentos. Esperá unos minutos y volvé a probar." };
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

async function subjectFor(userId: string, roles: readonly string[]) {
  return roles.includes("PATIENT") ? ((await db.patientProfile.findUnique({ where: { userId }, select: { id: true } }))?.id ?? null) : null;
}

export const updateNameAction = withFormErrors("updateNameAction", async (_prev: FormState, formData: FormData): Promise<FormState> => {
  const session = await getCurrentSession();
  if (!session) return FORBIDDEN;
  const values = { firstName: str(formData.get("firstName")).slice(0, 100), lastName: str(formData.get("lastName")).slice(0, 100) };
  const parsed = profileNameSchema.safeParse(values);
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values };
  const before = await db.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { firstName: true, lastName: true } });
  const fields = (["firstName", "lastName"] as const).filter((k) => before[k] !== parsed.data[k]);
  if (fields.length === 0) return { status: "success", message: "No hubo cambios.", values };
  await db.user.update({ where: { id: session.user.id }, data: parsed.data });
  await audit(
    { action: "PROFILE_UPDATED", actorType: actorTypeFor(session.user.roles), actorUserId: session.user.id, subjectPatientId: await subjectFor(session.user.id, session.user.roles), resourceType: "USER", resourceId: session.user.id, metadata: { fields } },
    await requestContext(),
  );
  revalidatePath("/", "layout");
  return { status: "success", message: "Datos actualizados.", values };
});

export const changePasswordAction = withFormErrors("changePasswordAction", async (_prev: FormState, formData: FormData): Promise<FormState> => {
  const session = await getCurrentSession();
  if (!session) return FORBIDDEN;
  if (!limiters.sensitive.consume(`pwd:${session.user.id}`).allowed) return TOO_MANY;
  const parsed = changePasswordSchema.safeParse({
    currentPassword: str(formData.get("currentPassword")),
    password: str(formData.get("password")),
    confirmPassword: str(formData.get("confirmPassword")),
    email: session.user.email,
  });
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };
  const result = await changePassword(session.user.id, parsed.data.currentPassword, parsed.data.password, session.sessionId, await requestContext());
  if (!result.ok) return { status: "error", ...(result.field ? { fieldErrors: { [result.field]: [result.error] } } : { message: result.error }) };
  revalidatePath("/settings/security");
  return {
    status: "success",
    message: result.data.sessionsRevoked ? `Contraseña actualizada. Cerramos ${result.data.sessionsRevoked} ${result.data.sessionsRevoked === 1 ? "sesión" : "sesiones"} en otros dispositivos.` : "Contraseña actualizada.",
  };
});

export type MfaSetupState = { step: "idle" | "scan" | "done"; qrDataUrl?: string; secret?: string; recoveryCodes?: string[]; error?: string };

export async function beginMfaSetupAction(): Promise<MfaSetupState> {
  const session = await getCurrentSession();
  if (!session) return { step: "idle", error: "Tu sesión venció." };
  if (session.user.mfaEnabled) return { step: "idle", error: "La verificación en dos pasos ya está activa." };
  if (!limiters.sensitive.consume(`mfa-setup:${session.user.id}`).allowed) return { step: "idle", error: "Demasiados intentos. Esperá unos minutos." };
  const { qrDataUrl, secret } = await beginMfaSetup(session.user.id);
  return { step: "scan", qrDataUrl, secret };
}

export async function confirmMfaSetupAction(code: string): Promise<MfaSetupState> {
  const session = await getCurrentSession();
  if (!session) return { step: "idle", error: "Tu sesión venció." };
  if (!limiters.mfa.consume(`setup:${session.user.id}`).allowed) return { step: "scan", error: "Demasiados intentos. Esperá unos minutos." };
  const parsed = mfaCodeSchema.safeParse(code);
  if (!parsed.success || !/^\d{6}$/.test(parsed.data)) return { step: "scan", error: "Ingresá el código de 6 dígitos de tu aplicación." };
  const result = await confirmMfaSetup(session.user.id, parsed.data, await requestContext());
  if (!result.ok) return { step: "scan", error: result.error };
  // Sin revalidar acá: la página se refresca cuando el usuario confirma que guardó los códigos
  // (si no, el re-render ocultaría los códigos de recuperación, que se muestran una sola vez).
  return { step: "done", recoveryCodes: result.recoveryCodes };
}

export const disableMfaAction = withFormErrors("disableMfaAction", async (_prev: FormState, formData: FormData): Promise<FormState> => {
  const session = await getCurrentSession();
  if (!session) return FORBIDDEN;
  if (!limiters.sensitive.consume(`mfa-off:${session.user.id}`).allowed) return TOO_MANY;
  const result = await disableMfa(session.user.id, str(formData.get("password")), str(formData.get("code")), await requestContext());
  if (!result.ok) return { status: "error", ...(result.field ? { fieldErrors: { [result.field]: [result.error] } } : { message: result.error }) };
  revalidatePath("/", "layout");
  return { status: "success", message: "Desactivaste la verificación en dos pasos." };
});

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const session = await getCurrentSession();
  if (!session) return;
  const publicId = str(formData.get("publicId")).slice(0, 64);
  if (publicId === session.sessionPublicId) return; // la actual se cierra con "Salir"
  // revokeUserSession filtra por userId: no se puede cerrar la sesión de otra persona.
  if (await revokeUserSession(session.user.id, publicId)) {
    await audit(
      { action: "SESSION_REVOKED", actorType: actorTypeFor(session.user.roles), actorUserId: session.user.id, subjectPatientId: await subjectFor(session.user.id, session.user.roles), resourceType: "SESSION", metadata: { sessionsRevoked: 1 } },
      await requestContext(),
    );
  }
  revalidatePath("/settings/security");
}

export async function revokeOtherSessionsAction(): Promise<void> {
  const session = await getCurrentSession();
  if (!session) return;
  const count = await invalidateAllUserSessions(session.user.id, session.sessionId);
  if (count) {
    await audit(
      { action: "SESSION_REVOKED", actorType: actorTypeFor(session.user.roles), actorUserId: session.user.id, subjectPatientId: await subjectFor(session.user.id, session.user.roles), resourceType: "SESSION", metadata: { sessionsRevoked: count } },
      await requestContext(),
    );
  }
  revalidatePath("/settings/security");
}
