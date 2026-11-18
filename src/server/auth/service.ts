import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { hashPassword, needsRehash, verifyAgainstDummy, verifyPassword } from "@/server/auth/password";
import { generateToken, hashToken } from "@/server/auth/tokens";
import { invalidateAllUserSessions } from "@/server/auth/session";
import { RateLimiter } from "@/server/auth/rate-limit";
import { actorTypeFor, audit, type AuditContext } from "@/server/audit/log";
import {
  sendDuplicateRegistrationEmail,
  sendLockoutEmail,
  sendPasswordChangedEmail,
  sendVerificationEmail,
} from "@/server/auth/emails";
import type { RegisterDoctorInput, RegisterPatientInput } from "@/features/auth/schemas";

/**
 * Lógica de negocio de autenticación, independiente de Next.js (no lee cookies ni headers),
 * lo que permite testearla de forma aislada. Audita cada evento relevante.
 */

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string; field?: string };

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // 30 minutos
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
export const MAX_FAILED_LOGINS = 5;
const BASE_LOCK_MINUTES = 15;
const MAX_LOCK_MINUTES = 24 * 60;

export const GENERIC_LOGIN_ERROR = "Email o contraseña incorrectos";
export const TOO_MANY_ATTEMPTS = "Demasiados intentos. Esperá unos minutos y volvé a probar.";

function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function rolesOf(userId: string): Promise<Role[]> {
  return (await db.userRole.findMany({ where: { userId }, select: { role: true } })).map((r) => r.role);
}

// ─── Verificación de email ────────────────────────────────────────────────

/** Genera y envía un enlace de verificación. Limita reenvíos a uno cada 2 minutos. */
export async function issueEmailVerification(userId: string, opts: { force?: boolean } = {}): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true, emailVerifiedAt: true } });
  if (!user || user.emailVerifiedAt) return null;
  if (!opts.force) {
    const recent = await db.emailVerificationToken.findFirst({ where: { userId, usedAt: null, createdAt: { gt: new Date(Date.now() - 2 * 60 * 1000) } } });
    if (recent) return null;
  }
  const token = generateToken();
  await db.$transaction([
    db.emailVerificationToken.deleteMany({ where: { userId, usedAt: null } }),
    db.emailVerificationToken.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS) } }),
  ]);
  await sendVerificationEmail(user.email, user.firstName, token);
  return token;
}

export async function verifyEmailToken(token: string, ctx: AuditContext = {}): Promise<boolean> {
  if (!token || token.length > 200) return false;
  const record = await db.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) return false;
  const consumed = await db.emailVerificationToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (consumed.count !== 1) return false;
  await db.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
  await audit({ action: "EMAIL_VERIFIED", actorType: actorTypeFor(await rolesOf(record.userId)), actorUserId: record.userId, resourceType: "USER", resourceId: record.userId }, ctx);
  return true;
}

// ─── Registro ──────────────────────────────────────────────────────────────

/**
 * Anti-enumeración: el resultado es idéntico exista o no el email. Si ya existe, no se crea
 * nada y se avisa por email al dueño de la cuenta. En ambos casos el usuario debe verificar
 * su email antes de poder ingresar.
 */
async function handleDuplicate(email: string): Promise<ServiceResult<{ userId: null }>> {
  const existing = await db.user.findUnique({ where: { email }, select: { firstName: true } });
  if (existing) await sendDuplicateRegistrationEmail(email, existing.firstName);
  return { ok: true, data: { userId: null } };
}

export async function registerPatient(
  input: Omit<RegisterPatientInput, "confirmPassword" | "acceptTerms">,
  ctx: AuditContext = {},
): Promise<ServiceResult<{ userId: string | null }>> {
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await db.user.create({
      data: {
        email: input.email,
        passwordHash,
        passwordChangedAt: new Date(),
        firstName: input.firstName,
        lastName: input.lastName,
        roles: { create: { role: "PATIENT" } },
        patientProfile: { create: {} },
      },
      select: { id: true },
    });
    await audit({ action: "ACCOUNT_REGISTERED", actorType: "PATIENT", actorUserId: user.id, resourceType: "USER", resourceId: user.id, metadata: { role: "PATIENT" } }, ctx);
    await issueEmailVerification(user.id, { force: true });
    return { ok: true, data: { userId: user.id } };
  } catch (error) {
    if (isUniqueViolation(error)) return handleDuplicate(input.email);
    throw error;
  }
}

export async function registerDoctor(
  input: Omit<RegisterDoctorInput, "confirmPassword" | "acceptTerms">,
  ctx: AuditContext = {},
): Promise<ServiceResult<{ userId: string | null }>> {
  if (await db.user.findUnique({ where: { email: input.email }, select: { id: true } })) return handleDuplicate(input.email);
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await db.user.create({
      data: {
        email: input.email,
        passwordHash,
        passwordChangedAt: new Date(),
        firstName: input.firstName,
        lastName: input.lastName,
        // El rol DOCTOR se asigna al registrarse, pero toda capacidad clínica exige además
        // verificationStatus = VERIFIED (ver src/server/access/policy.ts).
        roles: { create: { role: "DOCTOR" } },
        doctorProfile: {
          create: {
            specialty: input.specialty,
            licenseNumber: input.licenseNumber,
            jurisdiction: input.jurisdiction,
            verificationStatus: "PENDING",
            verifications: { create: { status: "PENDING", note: "Solicitud de verificación enviada" } },
          },
        },
      },
      select: { id: true },
    });
    await audit({ action: "ACCOUNT_REGISTERED", actorType: "DOCTOR", actorUserId: user.id, resourceType: "USER", resourceId: user.id, metadata: { role: "DOCTOR" } }, ctx);
    await issueEmailVerification(user.id, { force: true });
    return { ok: true, data: { userId: user.id } };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const target = JSON.stringify(error.meta ?? {});
      // La matrícula es un dato público del registro profesional: informarlo no expone cuentas.
      if (target.includes("license") || target.includes("jurisdiction")) {
        return { ok: false, field: "licenseNumber", error: "Esa matrícula ya está registrada en esa jurisdicción" };
      }
      return handleDuplicate(input.email);
    }
    throw error;
  }
}

// ─── Login ─────────────────────────────────────────────────────────────────

export type AuthResult =
  | { status: "ok"; userId: string; mfaRequired: boolean }
  | { status: "invalid" | "locked" | "suspended" | "unverified" };

/** Emails inexistentes: mismo umbral que el bloqueo de cuentas reales (no revela si existen). */
const unknownAccountLimiter = new RateLimiter(MAX_FAILED_LOGINS, BASE_LOCK_MINUTES * 60 * 1000);

function lockMinutesFor(failedCount: number): number {
  const level = Math.floor(failedCount / MAX_FAILED_LOGINS) - 1; // 5 → 0, 10 → 1, …
  return Math.min(BASE_LOCK_MINUTES * 2 ** Math.max(0, level), MAX_LOCK_MINUTES);
}

/**
 * Verifica credenciales con defensa contra fuerza bruta (bloqueo progresivo por cuenta) y
 * sin revelar si el email existe (mensaje y tiempo de respuesta equivalentes).
 */
export async function authenticate(email: string, password: string, ctx: AuditContext = {}): Promise<AuthResult> {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, status: true, firstName: true, emailVerifiedAt: true, failedLoginCount: true, lockedUntil: true, mfaEnabledAt: true },
  });

  if (!user) {
    await verifyAgainstDummy(password);
    const limited = !unknownAccountLimiter.consume(email).allowed;
    await audit({ action: "LOGIN_FAILED", outcome: "FAILURE", actorType: "ANONYMOUS", metadata: { reason: limited ? "unknown_account_throttled" : "unknown_account" } }, ctx);
    return { status: limited ? "locked" : "invalid" };
  }

  const roles = await rolesOf(user.id);
  const actorType = actorTypeFor(roles);
  const subject = roles.includes("PATIENT") ? (await db.patientProfile.findUnique({ where: { userId: user.id }, select: { id: true } }))?.id : null;
  const base = { actorType, actorUserId: user.id, subjectPatientId: subject ?? null, resourceType: "USER", resourceId: user.id } as const;

  // Cuenta bloqueada: ni siquiera se verifica la contraseña (frena la fuerza bruta).
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await verifyAgainstDummy(password);
    await audit({ ...base, action: "LOGIN_FAILED", outcome: "DENIED", metadata: { reason: "locked" } }, ctx);
    return { status: "locked" };
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    const shouldLock = failed % MAX_FAILED_LOGINS === 0;
    const minutes = lockMinutesFor(failed);
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: failed, ...(shouldLock ? { lockedUntil: new Date(Date.now() + minutes * 60 * 1000) } : {}) },
    });
    await audit({ ...base, action: "LOGIN_FAILED", outcome: "FAILURE", metadata: { reason: "bad_password" } }, ctx);
    if (shouldLock) {
      await audit({ ...base, action: "LOGIN_LOCKED", outcome: "DENIED", metadata: { lockedMinutes: minutes } }, ctx);
      await sendLockoutEmail(email, user.firstName, minutes);
      return { status: "locked" };
    }
    return { status: "invalid" };
  }

  if (user.status !== "ACTIVE") {
    await audit({ ...base, action: "LOGIN_FAILED", outcome: "DENIED", metadata: { reason: "suspended" } }, ctx);
    return { status: "suspended" };
  }

  if (!user.emailVerifiedAt) {
    await issueEmailVerification(user.id); // reenvía el enlace (como máximo cada 2 minutos)
    await audit({ ...base, action: "LOGIN_FAILED", outcome: "DENIED", metadata: { reason: "email_not_verified" } }, ctx);
    return { status: "unverified" };
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      // Si los parámetros de Argon2 se endurecieron, se actualiza el hash ahora que tenemos la contraseña.
      ...(needsRehash(user.passwordHash) ? { passwordHash: await hashPassword(password) } : {}),
    },
  });
  return { status: "ok", userId: user.id, mfaRequired: !!user.mfaEnabledAt };
}

/** Registra el login exitoso (cuando ya se creó la sesión, después de MFA si corresponde). */
export async function recordSuccessfulLogin(userId: string, ctx: AuditContext, method: "password" | "totp" | "recovery_code") {
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  const roles = await rolesOf(userId);
  const subject = roles.includes("PATIENT") ? (await db.patientProfile.findUnique({ where: { userId }, select: { id: true } }))?.id : null;
  await audit({ action: "LOGIN_SUCCEEDED", actorType: actorTypeFor(roles), actorUserId: userId, subjectPatientId: subject ?? null, resourceType: "USER", resourceId: userId, metadata: { method } }, ctx);
}

// ─── Contraseñas ───────────────────────────────────────────────────────────

/**
 * Genera un token de recuperación. Devuelve el token en claro sólo para enviarlo por email,
 * o null si el email no corresponde a una cuenta activa (el llamador responde igual en ambos casos).
 */
export async function createPasswordResetToken(email: string, ctx: AuditContext = {}): Promise<{ token: string; firstName: string } | null> {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, status: true, firstName: true } });
  if (!user || user.status !== "ACTIVE") return null;

  const token = generateToken();
  await db.$transaction([
    db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    db.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) } }),
  ]);
  await audit({ action: "PASSWORD_RESET_REQUESTED", actorType: actorTypeFor(await rolesOf(user.id)), actorUserId: user.id, resourceType: "USER", resourceId: user.id }, ctx);
  return { token, firstName: user.firstName };
}

export async function isPasswordResetTokenValid(token: string): Promise<boolean> {
  if (!token || token.length > 200) return false;
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  return !!record && !record.usedAt && record.expiresAt > new Date();
}

/** Cambia la contraseña usando un token, cierra todas las sesiones y desbloquea la cuenta. */
export async function resetPasswordWithToken(token: string, newPassword: string, ctx: AuditContext = {}): Promise<ServiceResult<{ userId: string }>> {
  const invalid = { ok: false as const, error: "El enlace no es válido o ya expiró. Pedí uno nuevo." };
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) return invalid;

  const passwordHash = await hashPassword(newPassword);
  // Marcado atómico: si dos requests usan el mismo token, sólo una gana.
  const consumed = await db.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (consumed.count === 0) return invalid;

  const user = await db.user.update({
    where: { id: record.userId },
    // Recibir el enlace prueba que el usuario controla su email.
    data: { passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    select: { email: true, firstName: true, emailVerifiedAt: true },
  });
  if (!user.emailVerifiedAt) await db.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
  const revoked = await invalidateAllUserSessions(record.userId);
  await audit({ action: "PASSWORD_RESET_COMPLETED", actorType: actorTypeFor(await rolesOf(record.userId)), actorUserId: record.userId, resourceType: "USER", resourceId: record.userId, metadata: { sessionsRevoked: revoked } }, ctx);
  await sendPasswordChangedEmail(user.email, user.firstName);
  return { ok: true, data: { userId: record.userId } };
}

/** Cambio de contraseña desde la configuración: exige la actual y cierra las demás sesiones. */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentSessionId: string,
  ctx: AuditContext = {},
): Promise<ServiceResult<{ sessionsRevoked: number }>> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true, email: true, firstName: true } });
  if (!user) return { ok: false, error: "Usuario no encontrado" };
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    await audit({ action: "PASSWORD_CHANGED", outcome: "FAILURE", actorType: actorTypeFor(await rolesOf(userId)), actorUserId: userId, resourceType: "USER", resourceId: userId, metadata: { reason: "bad_current_password" } }, ctx);
    return { ok: false, field: "currentPassword", error: "La contraseña actual no es correcta" };
  }
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() } });
  const revoked = await invalidateAllUserSessions(userId, currentSessionId);
  await audit({ action: "PASSWORD_CHANGED", actorType: actorTypeFor(await rolesOf(userId)), actorUserId: userId, resourceType: "USER", resourceId: userId, metadata: { sessionsRevoked: revoked } }, ctx);
  await sendPasswordChangedEmail(user.email, user.firstName);
  return { ok: true, data: { sessionsRevoked: revoked } };
}
