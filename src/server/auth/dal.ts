import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { getSessionCookie } from "@/server/auth/cookies";
import { validateSessionToken } from "@/server/auth/session";
import { hasRole, homePathForRoles } from "@/server/auth/roles";

/**
 * Data Access Layer de autenticación.
 *
 * TODA verificación de acceso pasa por acá (páginas, layouts y server actions).
 * Ocultar elementos en la UI es sólo cosmético; la autorización real ocurre en el servidor.
 */

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof validateSessionToken>>>["user"];

/** Usuario autenticado de la request actual (memoizado por request) o null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = await getSessionCookie();
  if (!token) return null;
  const result = await validateSessionToken(token);
  return result?.user ?? null;
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Exige un rol. Si el usuario no lo tiene, lo envía a su propio inicio. */
export async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasRole(user.roles, role)) redirect(homePathForRoles(user.roles));
  return user;
}

/** Para server actions: no redirige, devuelve null si no hay permiso. */
export async function authorizeRole(role: Role): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  if (!user || !hasRole(user.roles, role)) return null;
  return user;
}

/** Para páginas públicas de autenticación: si ya hay sesión, ir al panel. */
export async function redirectIfAuthenticated(): Promise<void> {
  const user = await getCurrentUser();
  if (user) redirect(homePathForRoles(user.roles));
}
