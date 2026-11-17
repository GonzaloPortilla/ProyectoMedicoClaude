import "server-only";
import { cookies, headers } from "next/headers";
import { env } from "@/server/env";
import type { SessionMeta } from "@/server/auth/session";

export const SESSION_COOKIE = "medapp_session";

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // inaccesible desde JavaScript (mitiga robo por XSS)
    secure: env.NODE_ENV === "production",
    sameSite: "lax", // mitiga CSRF en navegación cruzada
    path: "/",
    expires: expiresAt,
  });
}

export async function getSessionCookie(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getRequestMeta(): Promise<SessionMeta & { ip: string }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return { ip, ipAddress: ip, userAgent: h.get("user-agent") };
}
