import "server-only";
import { db } from "@/server/db";
import { generateToken, hashToken } from "@/server/auth/tokens";

export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días (expiración absoluta)

export type SessionMeta = { ipAddress?: string | null; userAgent?: string | null };

/** Crea una sesión y devuelve el token en claro (sólo para la cookie). */
export async function createSession(userId: string, meta: SessionMeta = {}) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await db.session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt,
      ipAddress: meta.ipAddress?.slice(0, 64) ?? null,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    },
  });
  return { token, expiresAt };
}

/**
 * Valida un token de sesión. Devuelve el usuario (con roles) o null.
 * Sesiones expiradas o de usuarios suspendidos se descartan.
 */
export async function validateSessionToken(token: string) {
  if (!token || token.length > 200) return null;
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
          roles: { select: { role: true } },
        },
      },
    },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (session.user.status !== "ACTIVE") return null;

  const { roles, ...user } = session.user;
  return { sessionId: session.id, user: { ...user, roles: roles.map((r) => r.role) } };
}

export async function invalidateSessionToken(token: string): Promise<void> {
  await db.session.deleteMany({ where: { id: hashToken(token) } });
}

export async function invalidateAllUserSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}

export async function deleteExpiredSessions(): Promise<number> {
  const { count } = await db.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  return count;
}
