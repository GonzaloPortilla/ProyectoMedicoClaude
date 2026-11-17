import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "@/server/auth/password";
import { generateToken, hashToken } from "@/server/auth/tokens";
import { invalidateAllUserSessions } from "@/server/auth/session";
import type { RegisterDoctorInput, RegisterPatientInput } from "@/features/auth/schemas";

/**
 * Lógica de negocio de autenticación, independiente de Next.js
 * (no lee cookies ni headers), lo que permite testearla de forma aislada.
 */

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string; field?: string };

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // 30 minutos

function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function registerPatient(input: Omit<RegisterPatientInput, "confirmPassword" | "acceptTerms">): Promise<ServiceResult<{ userId: string }>> {
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await db.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        roles: { create: { role: "PATIENT" } },
        patientProfile: { create: {} },
      },
      select: { id: true },
    });
    return { ok: true, data: { userId: user.id } };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, field: "email", error: "Ya existe una cuenta con ese email" };
    }
    throw error;
  }
}

export async function registerDoctor(input: Omit<RegisterDoctorInput, "confirmPassword" | "acceptTerms">): Promise<ServiceResult<{ userId: string }>> {
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await db.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        // El rol DOCTOR se asigna al registrarse, pero toda capacidad clínica futura
        // exigirá además verificationStatus = VERIFIED.
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
    return { ok: true, data: { userId: user.id } };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const target = JSON.stringify(error.meta ?? {});
      if (target.includes("license") || target.includes("jurisdiction")) {
        return { ok: false, field: "licenseNumber", error: "Esa matrícula ya está registrada en esa jurisdicción" };
      }
      return { ok: false, field: "email", error: "Ya existe una cuenta con ese email" };
    }
    throw error;
  }
}

/** Verifica credenciales con un mensaje genérico (no revela si el email existe). */
export async function authenticate(email: string, password: string): Promise<ServiceResult<{ userId: string }>> {
  const genericError = { ok: false as const, error: "Email o contraseña incorrectos" };
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, status: true },
  });
  if (!user) {
    await verifyAgainstDummy(password);
    return genericError;
  }
  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) return genericError;
  if (user.status !== "ACTIVE") {
    return { ok: false, error: "Tu cuenta está suspendida. Contactá a soporte." };
  }
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { ok: true, data: { userId: user.id } };
}

/**
 * Genera un token de recuperación. Devuelve el token en claro sólo para enviarlo por email,
 * o null si el email no corresponde a una cuenta activa (el llamador responde igual en ambos casos).
 */
export async function createPasswordResetToken(email: string): Promise<{ token: string; firstName: string } | null> {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, status: true, firstName: true } });
  if (!user || user.status !== "ACTIVE") return null;

  const token = generateToken();
  await db.$transaction([
    // Sólo un token vigente por usuario.
    db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    db.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) },
    }),
  ]);
  return { token, firstName: user.firstName };
}

export async function isPasswordResetTokenValid(token: string): Promise<boolean> {
  if (!token || token.length > 200) return false;
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  return !!record && !record.usedAt && record.expiresAt > new Date();
}

/** Cambia la contraseña usando un token y cierra todas las sesiones del usuario. */
export async function resetPasswordWithToken(token: string, newPassword: string): Promise<ServiceResult<{ userId: string }>> {
  const invalid = { ok: false as const, error: "El enlace no es válido o ya expiró. Pedí uno nuevo." };
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) return invalid;

  const passwordHash = await hashPassword(newPassword);
  // Marcado atómico: si dos requests usan el mismo token, sólo una gana.
  const consumed = await db.passwordResetToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (consumed.count === 0) return invalid;

  await db.user.update({ where: { id: record.userId }, data: { passwordHash } });
  await invalidateAllUserSessions(record.userId);
  return { ok: true, data: { userId: record.userId } };
}
