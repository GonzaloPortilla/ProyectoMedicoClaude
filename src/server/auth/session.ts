import "server-only";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { generateToken, hashToken } from "@/server/auth/tokens";
import { anonymizeIp } from "@/server/audit/net";

const HOUR = 60 * 60 * 1000;

/**
 * Política de sesiones según el riesgo del rol (mínimo privilegio):
 * quien puede ver datos de terceros (médico, administrador) tiene sesiones más cortas.
 */
export function sessionPolicy(roles: readonly Role[]) {
  const privileged = roles.includes("DOCTOR") || roles.includes("ADMIN");
  return privileged ? { absoluteMs: 12 * HOUR, idleMs: 2 * HOUR } : { absoluteMs: 7 * 24 * HOUR, idleMs: 24 * HOUR };
}

/** Cada cuánto se actualiza lastSeenAt (evita una escritura por request). */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export type SessionMeta = { ipAddress?: string | null; userAgent?: string | null };

/** Crea una sesión y devuelve el token en claro (sólo para la cookie). */
export async function createSession(userId: string, meta: SessionMeta = {}, opts: { mfaVerified?: boolean } = {}) {
  const roles = (await db.userRole.findMany({ where: { userId }, select: { role: true } })).map((r) => r.role);
  const token = generateToken();
  const expiresAt = new Date(Date.now() + sessionPolicy(roles).absoluteMs);
  const session = await db.session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt,
      mfaVerified: opts.mfaVerified ?? false,
      ipAddress: anonymizeIp(meta.ipAddress),
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    },
    select: { publicId: true },
  });
  return { token, expiresAt, publicId: session.publicId };
}

/**
 * Valida un token de sesión. Devuelve el usuario (con roles) o null.
 * Descarta sesiones vencidas (absoluto o inactividad) y de usuarios no activos.
 */
export async function validateSessionToken(token: string, now: Date = new Date()) {
  if (!token || token.length > 200) return null;
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    select: {
      id: true,
      publicId: true,
      expiresAt: true,
      lastSeenAt: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
          emailVerifiedAt: true,
          mfaEnabledAt: true,
          roles: { select: { role: true } },
        },
      },
    },
  });
  if (!session) return null;
  const roles = session.user.roles.map((r) => r.role);
  const { idleMs } = sessionPolicy(roles);
  const expired = session.expiresAt.getTime() <= now.getTime() || session.lastSeenAt.getTime() + idleMs <= now.getTime();
  if (expired || session.user.status !== "ACTIVE") {
    await db.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.updateMany({ where: { id: session.id }, data: { lastSeenAt: now } });
  }
  const { roles: _r, mfaEnabledAt, emailVerifiedAt, ...user } = session.user;
  void _r;
  return {
    sessionId: session.id,
    sessionPublicId: session.publicId,
    user: { ...user, roles, mfaEnabled: !!mfaEnabledAt, emailVerified: !!emailVerifiedAt },
  };
}

export async function invalidateSessionToken(token: string): Promise<void> {
  await db.session.deleteMany({ where: { id: hashToken(token) } });
}

export async function invalidateAllUserSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const { count } = await db.session.deleteMany({ where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) } });
  return count;
}

export async function listUserSessions(userId: string) {
  return db.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, publicId: true, createdAt: true, lastSeenAt: true, expiresAt: true, ipAddress: true, userAgent: true },
  });
}

/** Cierra una sesión propia por su id público. Nunca permite cerrar sesiones de otro usuario. */
export async function revokeUserSession(userId: string, publicId: string): Promise<boolean> {
  const { count } = await db.session.deleteMany({ where: { userId, publicId } });
  return count === 1;
}

export async function deleteExpiredSessions(): Promise<number> {
  const { count } = await db.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  return count;
}
