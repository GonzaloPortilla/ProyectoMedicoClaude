"use server";

import { redirect } from "next/navigation";
import { formObject, safeValues, zodFieldErrors, type FormState } from "@/lib/form";
import { env } from "@/server/env";
import {
  forgotPasswordSchema,
  loginSchema,
  registerDoctorSchema,
  registerPatientSchema,
  resetPasswordSchema,
} from "@/features/auth/schemas";
import {
  authenticate,
  createPasswordResetToken,
  registerDoctor,
  registerPatient,
  resetPasswordWithToken,
} from "@/server/auth/service";
import { createSession, invalidateSessionToken } from "@/server/auth/session";
import { clearSessionCookie, getRequestMeta, getSessionCookie, setSessionCookie } from "@/server/auth/cookies";
import { limiters } from "@/server/auth/rate-limit";
import { sendMail } from "@/server/mail/mailer";

const TOO_MANY: FormState = {
  status: "error",
  message: "Demasiados intentos. Esperá unos minutos y volvé a probar.",
};

async function startSession(userId: string) {
  const meta = await getRequestMeta();
  const { token, expiresAt } = await createSession(userId, meta);
  await setSessionCookie(token, expiresAt);
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = safeValues(formData);
  const parsed = loginSchema.safeParse(formObject(formData, ["email", "password"]));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values };

  const { ip } = await getRequestMeta();
  const limitKey = `${ip}:${parsed.data.email}`;
  if (!limiters.login.consume(limitKey).allowed) return { ...TOO_MANY, values };

  const result = await authenticate(parsed.data.email, parsed.data.password);
  if (!result.ok) return { status: "error", message: result.error, values };

  limiters.login.reset(limitKey);
  await startSession(result.data.userId);
  // /dashboard decide el inicio según los roles reales del usuario.
  redirect("/dashboard");
}

export async function registerPatientAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = safeValues(formData);
  const parsed = registerPatientSchema.safeParse(
    formObject(formData, ["firstName", "lastName", "email", "password", "confirmPassword", "acceptTerms"]),
  );
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values };

  const { ip } = await getRequestMeta();
  if (!limiters.register.consume(ip).allowed) return { ...TOO_MANY, values };

  const result = await registerPatient(parsed.data);
  if (!result.ok) {
    return { status: "error", values, fieldErrors: result.field ? { [result.field]: [result.error] } : undefined, message: result.field ? undefined : result.error };
  }
  await startSession(result.data.userId);
  redirect("/patient?welcome=1");
}

export async function registerDoctorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = safeValues(formData);
  const parsed = registerDoctorSchema.safeParse(
    formObject(formData, [
      "firstName",
      "lastName",
      "email",
      "specialty",
      "licenseNumber",
      "jurisdiction",
      "password",
      "confirmPassword",
      "acceptTerms",
    ]),
  );
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values };

  const { ip } = await getRequestMeta();
  if (!limiters.register.consume(ip).allowed) return { ...TOO_MANY, values };

  const result = await registerDoctor(parsed.data);
  if (!result.ok) {
    return { status: "error", values, fieldErrors: result.field ? { [result.field]: [result.error] } : undefined, message: result.field ? undefined : result.error };
  }
  await startSession(result.data.userId);
  redirect("/doctor?welcome=1");
}

export async function logoutAction(): Promise<void> {
  const token = await getSessionCookie();
  if (token) await invalidateSessionToken(token);
  await clearSessionCookie();
  redirect("/login");
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = safeValues(formData);
  const parsed = forgotPasswordSchema.safeParse(formObject(formData, ["email"]));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values };

  const { ip } = await getRequestMeta();
  if (!limiters.passwordReset.consume(`${ip}:${parsed.data.email}`).allowed) return { ...TOO_MANY, values };

  const reset = await createPasswordResetToken(parsed.data.email);
  if (reset) {
    const link = new URL(`/reset-password?token=${encodeURIComponent(reset.token)}`, env.APP_URL).toString();
    await sendMail({
      to: parsed.data.email,
      subject: "Restablecé tu contraseña",
      text: `Hola ${reset.firstName}:\n\nPara elegir una nueva contraseña abrí este enlace (vence en 30 minutos):\n${link}\n\nSi no lo pediste, ignorá este mensaje.`,
    });
  }
  // Misma respuesta exista o no la cuenta (evita enumeración de emails).
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
  const { ip } = await getRequestMeta();
  if (!limiters.passwordReset.consume(`reset:${ip}`).allowed) return TOO_MANY;

  const result = await resetPasswordWithToken(parsed.data.token, parsed.data.password);
  if (!result.ok) return { status: "error", message: result.error };
  redirect("/login?reset=1");
}
