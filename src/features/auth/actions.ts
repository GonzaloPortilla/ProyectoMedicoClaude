"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { formObject, safeValues, zodFieldErrors, type FormState } from "@/lib/form";
import { env } from "@/server/env";
import {
  forgotPasswordSchema,
  loginSchema,
  mfaCodeSchema,
  registerDoctorSchema,
  registerPatientSchema,
  resetPasswordSchema,
} from "@/features/auth/schemas";
import {
  authenticate,
  createPasswordResetToken,
  GENERIC_LOGIN_ERROR,
  recordSuccessfulLogin,
  registerDoctor,
  registerPatient,
  resetPasswordWithToken,
  TOO_MANY_ATTEMPTS,
  verifyEmailToken,
} from "@/server/auth/service";
import { createSession, invalidateSessionToken, validateSessionToken } from "@/server/auth/session";
import {
  clearMfaChallengeCookie,
  clearSessionCookie,
  getMfaChallengeCookie,
  getSessionCookie,
  setMfaChallengeCookie,
  setSessionCookie,
} from "@/server/auth/cookies";
import { createMfaChallenge, readMfaChallenge, verifySecondFactor } from "@/server/auth/mfa";
import { limiters } from "@/server/auth/rate-limit";
import { actorTypeFor, audit } from "@/server/audit/log";
import { requestContext } from "@/server/audit/request";
import { sendMail } from "@/server/mail/mailer";
import { db } from "@/server/db";

const TOO_MANY: FormState = { status: "error", message: TOO_MANY_ATTEMPTS };

async function startSession(userId: string, mfaVerified: boolean) {
  const ctx = await requestContext();
  const { token, expiresAt } = await createSession(userId, { ipAddress: ctx.ip, userAgent: ctx.userAgent }, { mfaVerified });
  await setSessionCookie(token, expiresAt);
}

// ─── Login (paso 1: contraseña) ────────────────────────────────────────────

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = safeValues(formData);
  const parsed = loginSchema.safeParse(formObject(formData, ["email", "password"]));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values };

  const ctx = await requestContext();
  // Límite por IP (frena barridos de muchas cuentas desde un mismo origen).
  if (!limiters.loginIp.consume(ctx.ip).allowed) return { ...TOO_MANY, values };

  const result = await authenticate(parsed.data.email, parsed.data.password, ctx);
  switch (result.status) {
    case "invalid":
      return { status: "error", message: GENERIC_LOGIN_ERROR, values };
    case "locked":
      return { ...TOO_MANY, values };
    case "suspended":
      return { status: "error", message: "Tu cuenta está suspendida. Contactá a soporte.", values };
    case "unverified":
      return { status: "error", message: "Tenés que verificar tu email antes de ingresar. Te reenviamos el enlace de activación.", values };
  }

  if (result.mfaRequired) {
    // Segundo paso: no hay sesión todavía, sólo un desafío firmado de 5 minutos.
    const challenge = createMfaChallenge(result.userId);
    await setMfaChallengeCookie(challenge.value, challenge.expiresAt);
    redirect("/login/mfa");
  }
  await startSession(result.userId, true);
  await recordSuccessfulLogin(result.userId, ctx, "password");
  // /dashboard decide el inicio según los roles reales del usuario.
  redirect("/dashboard");
}

// ─── Login (paso 2: verificación en dos pasos) ─────────────────────────────

export async function mfaLoginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const challenge = readMfaChallenge(await getMfaChallengeCookie());
  if (!challenge) return { status: "error", message: "La verificación venció. Volvé a ingresar tu contraseña." };

  const parsed = mfaCodeSchema.safeParse(formData.get("code") ?? "");
  if (!parsed.success) return { status: "error", fieldErrors: { code: [parsed.error.issues[0]!.message] } };

  const ctx = await requestContext();
  if (!limiters.mfa.consume(challenge.userId).allowed) return TOO_MANY;

  const check = await verifySecondFactor(challenge.userId, parsed.data);
  if (!check.ok) {
    const roles = (await db.userRole.findMany({ where: { userId: challenge.userId }, select: { role: true } })).map((r) => r.role);
    await audit({ action: "MFA_CHALLENGE_FAILED", outcome: "FAILURE", actorType: actorTypeFor(roles), actorUserId: challenge.userId, resourceType: "USER", resourceId: challenge.userId }, ctx);
    return { status: "error", fieldErrors: { code: ["El código no es correcto"] } };
  }
  limiters.mfa.reset(challenge.userId);
  await clearMfaChallengeCookie();
  await startSession(challenge.userId, true);
  if (check.method === "recovery_code") {
    const roles = (await db.userRole.findMany({ where: { userId: challenge.userId }, select: { role: true } })).map((r) => r.role);
    await audit({ action: "MFA_RECOVERY_CODE_USED", actorType: actorTypeFor(roles), actorUserId: challenge.userId, resourceType: "USER", resourceId: challenge.userId }, ctx);
  }
  await recordSuccessfulLogin(challenge.userId, ctx, check.method);
  redirect("/dashboard");
}

// ─── Registro ──────────────────────────────────────────────────────────────

export async function registerPatientAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = safeValues(formData);
  const parsed = registerPatientSchema.safeParse(
    formObject(formData, ["firstName", "lastName", "email", "password", "confirmPassword", "acceptTerms"]),
  );
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values };

  const ctx = await requestContext();
  if (!limiters.register.consume(ctx.ip).allowed) return { ...TOO_MANY, values };

  const result = await registerPatient(parsed.data, ctx);
  if (!result.ok) return { status: "error", values, message: result.error };
  // Misma respuesta exista o no la cuenta: no se revela qué emails están registrados.
  redirect("/register/check-email");
}

export async function registerDoctorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = safeValues(formData);
  const parsed = registerDoctorSchema.safeParse(
    formObject(formData, ["firstName", "lastName", "email", "specialty", "licenseNumber", "jurisdiction", "password", "confirmPassword", "acceptTerms"]),
  );
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values };

  const ctx = await requestContext();
  if (!limiters.register.consume(ctx.ip).allowed) return { ...TOO_MANY, values };

  const result = await registerDoctor(parsed.data, ctx);
  if (!result.ok) {
    return { status: "error", values, fieldErrors: result.field ? { [result.field]: [result.error] } : undefined, message: result.field ? undefined : result.error };
  }
  redirect("/register/check-email?professional=1");
}

export async function verifyEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = formData.get("token");
  if (typeof token !== "string") return { status: "error", message: "El enlace no es válido." };
  const ctx = await requestContext();
  if (!limiters.passwordReset.consume(`verify:${ctx.ip}`).allowed) return TOO_MANY;
  const ok = await verifyEmailToken(token, ctx);
  if (!ok) return { status: "error", message: "El enlace no es válido o ya venció. Ingresá con tu email y contraseña para recibir uno nuevo." };
  redirect("/login?verified=1");
}

// ─── Logout ────────────────────────────────────────────────────────────────

export async function logoutAction(): Promise<void> {
  const token = await getSessionCookie();
  if (token) {
    const session = await validateSessionToken(token);
    await invalidateSessionToken(token);
    if (session) {
      const subject = session.user.roles.includes("PATIENT") ? (await db.patientProfile.findUnique({ where: { userId: session.user.id }, select: { id: true } }))?.id : null;
      await audit({ action: "LOGOUT", actorType: actorTypeFor(session.user.roles), actorUserId: session.user.id, subjectPatientId: subject ?? null, resourceType: "SESSION" }, await requestContext());
    }
  }
  await clearSessionCookie();
  redirect("/login");
}

// ─── Recuperación de contraseña ────────────────────────────────────────────

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = safeValues(formData);
  const parsed = forgotPasswordSchema.safeParse(formObject(formData, ["email"]));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values };

  const ctx = await requestContext();
  if (!limiters.passwordReset.consume(`${ctx.ip}:${parsed.data.email}`).allowed) return { ...TOO_MANY, values };

  // El trabajo (buscar la cuenta, generar el token, enviar el email) se hace DESPUÉS de
  // responder: el tiempo de respuesta es el mismo exista o no la cuenta.
  const email = parsed.data.email;
  after(async () => {
    const reset = await createPasswordResetToken(email, ctx);
    if (!reset) return;
    const link = new URL(`/reset-password?token=${encodeURIComponent(reset.token)}`, env.APP_URL).toString();
    await sendMail({
      to: email,
      subject: "Restablecé tu contraseña",
      text: `Hola ${reset.firstName}:\n\nPara elegir una nueva contraseña abrí este enlace (vence en 30 minutos):\n${link}\n\nSi no lo pediste, ignorá este mensaje.`,
    });
  });
  return {
    status: "success",
    message: "Si existe una cuenta con ese email, te enviamos un enlace para restablecer la contraseña.",
  };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse(formObject(formData, ["token", "password", "confirmPassword"]));
  if (!parsed.success) {
    const fieldErrors = zodFieldErrors(parsed.error);
    if (fieldErrors.token) return { status: "error", message: "El enlace no es válido. Pedí uno nuevo." };
    return { status: "error", fieldErrors };
  }
  const ctx = await requestContext();
  if (!limiters.passwordReset.consume(`reset:${ctx.ip}`).allowed) return TOO_MANY;

  const result = await resetPasswordWithToken(parsed.data.token, parsed.data.password, ctx);
  if (!result.ok) return { status: "error", message: result.error };
  redirect("/login?reset=1");
}
