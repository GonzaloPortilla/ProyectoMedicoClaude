import "server-only";
import { env } from "@/server/env";
import { sendMail } from "@/server/mail/mailer";

/** Emails de seguridad. Nunca incluyen datos médicos. */
const url = (path: string) => new URL(path, env.APP_URL).toString();

export function sendVerificationEmail(to: string, firstName: string, token: string) {
  return sendMail({
    to,
    subject: "Activá tu cuenta",
    text: `Hola ${firstName}:\n\nPara activar tu cuenta abrí este enlace (vence en 24 horas):\n${url(`/verify-email?token=${encodeURIComponent(token)}`)}\n\nSi no creaste una cuenta, ignorá este mensaje.`,
  });
}

export function sendDuplicateRegistrationEmail(to: string, firstName: string) {
  return sendMail({
    to,
    subject: "Intento de registro con tu email",
    text: `Hola ${firstName}:\n\nAlguien intentó crear una cuenta nueva con tu email. Ya tenés una cuenta: podés ingresar en ${url("/login")} o recuperar tu contraseña en ${url("/forgot-password")}.\n\nSi no fuiste vos, no tenés que hacer nada.`,
  });
}

export function sendLockoutEmail(to: string, firstName: string, minutes: number) {
  return sendMail({
    to,
    subject: "Bloqueamos temporalmente el acceso a tu cuenta",
    text: `Hola ${firstName}:\n\nDetectamos varios intentos fallidos de inicio de sesión y bloqueamos el acceso por ${minutes} minutos.\n\nSi no fuiste vos, te recomendamos cambiar tu contraseña: ${url("/forgot-password")}`,
  });
}

export function sendPasswordChangedEmail(to: string, firstName: string) {
  return sendMail({
    to,
    subject: "Tu contraseña fue cambiada",
    text: `Hola ${firstName}:\n\nLa contraseña de tu cuenta se cambió y cerramos tus otras sesiones.\n\nSi no fuiste vos, recuperá el acceso de inmediato: ${url("/forgot-password")}`,
  });
}

export function sendMfaChangedEmail(to: string, firstName: string, enabled: boolean) {
  return sendMail({
    to,
    subject: enabled ? "Activaste la verificación en dos pasos" : "Desactivaste la verificación en dos pasos",
    text: `Hola ${firstName}:\n\n${enabled ? "La verificación en dos pasos quedó activada en tu cuenta." : "La verificación en dos pasos fue desactivada en tu cuenta."}\n\nSi no fuiste vos, cambiá tu contraseña de inmediato: ${url("/forgot-password")}`,
  });
}
