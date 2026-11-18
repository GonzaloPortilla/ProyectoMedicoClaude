import "server-only";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { decrypt, encrypt, hmac, safeEqual } from "@/server/crypto/keys";
import { hashToken } from "@/server/auth/tokens";
import { verifyPassword } from "@/server/auth/password";
import { generateRecoveryCodes, generateTotpSecret, normalizeRecoveryCode, otpauthUri, verifyTotp } from "@/server/auth/totp";
import { actorTypeFor, audit, type AuditContext } from "@/server/audit/log";
import { sendMfaChangedEmail } from "@/server/auth/emails";
import { env } from "@/server/env";

/**
 * Verificación en dos pasos (TOTP).
 * - El secreto se guarda cifrado con AES-256-GCM (clave derivada de APP_SECRET).
 * - Un mismo código no puede reutilizarse (se guarda el último paso aceptado).
 * - 10 códigos de recuperación de un solo uso, guardados como hash.
 */

const rolesOf = async (userId: string): Promise<Role[]> => (await db.userRole.findMany({ where: { userId }, select: { role: true } })).map((r) => r.role);

export function mfaRequiredFor(roles: readonly Role[]): boolean {
  return roles.some((r) => env.mfaRequiredRoles.includes(r));
}

/** Paso 1: genera un secreto pendiente (todavía no activa MFA). */
export async function beginMfaSetup(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, mfaEnabledAt: true } });
  if (user.mfaEnabledAt) throw new Error("La verificación en dos pasos ya está activa");
  const secret = generateTotpSecret();
  await db.user.update({ where: { id: userId }, data: { mfaSecretEnc: encrypt("mfa-secret", secret), mfaLastUsedStep: null } });
  const uri = otpauthUri(secret, user.email);
  return { secret, uri, qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}

/** Paso 2: el usuario confirma con un código válido. Devuelve los códigos de recuperación (se muestran una sola vez). */
export async function confirmMfaSetup(userId: string, code: string, ctx: AuditContext = {}): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: string }> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, firstName: true, mfaSecretEnc: true, mfaEnabledAt: true } });
  if (user.mfaEnabledAt) return { ok: false, error: "La verificación en dos pasos ya está activa" };
  if (!user.mfaSecretEnc) return { ok: false, error: "Volvé a iniciar la configuración" };
  const step = verifyTotp(decrypt("mfa-secret", user.mfaSecretEnc), code);
  if (step === null) return { ok: false, error: "El código no es correcto. Revisá la hora de tu teléfono y probá de nuevo." };

  const recoveryCodes = generateRecoveryCodes();
  await db.$transaction([
    db.mfaRecoveryCode.deleteMany({ where: { userId } }),
    db.mfaRecoveryCode.createMany({ data: recoveryCodes.map((c) => ({ userId, codeHash: hashToken(normalizeRecoveryCode(c)) })) }),
    db.user.update({ where: { id: userId }, data: { mfaEnabledAt: new Date(), mfaLastUsedStep: step } }),
  ]);
  await audit({ action: "MFA_ENABLED", actorType: actorTypeFor(await rolesOf(userId)), actorUserId: userId, resourceType: "USER", resourceId: userId }, ctx);
  await sendMfaChangedEmail(user.email, user.firstName, true);
  return { ok: true, recoveryCodes };
}

/** Desactivar exige contraseña y un código vigente. No se permite si el rol exige MFA. */
export async function disableMfa(userId: string, password: string, code: string, ctx: AuditContext = {}): Promise<{ ok: true } | { ok: false; error: string; field?: string }> {
  const roles = await rolesOf(userId);
  if (mfaRequiredFor(roles)) return { ok: false, error: "Tu rol exige verificación en dos pasos: no se puede desactivar." };
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, firstName: true, passwordHash: true } });
  if (!(await verifyPassword(user.passwordHash, password))) return { ok: false, field: "password", error: "La contraseña no es correcta" };
  const check = await verifySecondFactor(userId, code);
  if (!check.ok) return { ok: false, field: "code", error: "El código no es correcto" };
  await db.$transaction([
    db.mfaRecoveryCode.deleteMany({ where: { userId } }),
    db.user.update({ where: { id: userId }, data: { mfaSecretEnc: null, mfaEnabledAt: null, mfaLastUsedStep: null } }),
  ]);
  await audit({ action: "MFA_DISABLED", actorType: actorTypeFor(roles), actorUserId: userId, resourceType: "USER", resourceId: userId }, ctx);
  await sendMfaChangedEmail(user.email, user.firstName, false);
  return { ok: true };
}

/** Verifica un código TOTP o de recuperación (consume el de recuperación). */
export async function verifySecondFactor(userId: string, code: string): Promise<{ ok: true; method: "totp" | "recovery_code" } | { ok: false }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { mfaSecretEnc: true, mfaEnabledAt: true, mfaLastUsedStep: true } });
  if (!user?.mfaEnabledAt || !user.mfaSecretEnc) return { ok: false };
  const clean = code.replace(/\s/g, "");

  if (/^\d{6}$/.test(clean)) {
    const step = verifyTotp(decrypt("mfa-secret", user.mfaSecretEnc), clean, { lastUsedStep: user.mfaLastUsedStep });
    if (step === null) return { ok: false };
    // Actualización condicional: si dos requests usan el mismo código a la vez, sólo una gana.
    const { count } = await db.user.updateMany({
      where: { id: userId, OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step } }] },
      data: { mfaLastUsedStep: step },
    });
    return count === 1 ? { ok: true, method: "totp" } : { ok: false };
  }

  const normalized = normalizeRecoveryCode(clean);
  if (normalized.length !== 8) return { ok: false };
  const { count } = await db.mfaRecoveryCode.updateMany({ where: { userId, codeHash: hashToken(normalized), usedAt: null }, data: { usedAt: new Date() } });
  return count === 1 ? { ok: true, method: "recovery_code" } : { ok: false };
}

export async function remainingRecoveryCodes(userId: string): Promise<number> {
  return db.mfaRecoveryCode.count({ where: { userId, usedAt: null } });
}

// ─── Desafío entre la contraseña y el código ───────────────────────────────

export const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * Tras una contraseña correcta con MFA activa, en lugar de una sesión se emite un desafío
 * firmado (userId + vencimiento + nonce) que sólo sirve para completar el segundo paso.
 */
export function createMfaChallenge(userId: string, now = Date.now()): { value: string; expiresAt: Date } {
  const exp = now + MFA_CHALLENGE_TTL_MS;
  const nonce = randomBytes(12).toString("base64url");
  const payload = `${userId}.${exp}.${nonce}`;
  return { value: `${payload}.${hmac("mfa-challenge", payload)}`, expiresAt: new Date(exp) };
}

export function readMfaChallenge(value: string | undefined, now = Date.now()): { userId: string; nonce: string } | null {
  if (!value || value.length > 300) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [userId, exp, nonce, sig] = parts as [string, string, string, string];
  if (!safeEqual(sig, hmac("mfa-challenge", `${userId}.${exp}.${nonce}`))) return null;
  if (!/^\d+$/.test(exp) || Number(exp) < now) return null;
  return { userId, nonce };
}
