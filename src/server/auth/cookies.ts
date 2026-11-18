import "server-only";
import { cookies } from "next/headers";
import { env } from "@/server/env";
import { MFA_CHALLENGE_COOKIE, SESSION_COOKIE } from "@/lib/cookie-names";

export { SESSION_COOKIE, MFA_CHALLENGE_COOKIE };

const base = () => ({
  httpOnly: true, // inaccesible desde JavaScript (mitiga robo por XSS)
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const, // mitiga CSRF en navegación cruzada
  path: "/",
});

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, { ...base(), expires: expiresAt });
}

export async function getSessionCookie(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function setMfaChallengeCookie(value: string, expiresAt: Date) {
  (await cookies()).set(MFA_CHALLENGE_COOKIE, value, { ...base(), sameSite: "strict", expires: expiresAt });
}

export async function getMfaChallengeCookie(): Promise<string | undefined> {
  return (await cookies()).get(MFA_CHALLENGE_COOKIE)?.value;
}

export async function clearMfaChallengeCookie() {
  (await cookies()).delete(MFA_CHALLENGE_COOKIE);
}
