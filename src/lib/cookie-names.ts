/**
 * Nombres de cookies. En producción usan el prefijo `__Host-`, que el navegador sólo acepta
 * con Secure, Path=/ y sin Domain: impide que un subdominio comprometido las pise o las lea.
 * (Archivo sin "server-only" porque también lo usa el proxy.)
 */
const prod = process.env.NODE_ENV === "production";

export const SESSION_COOKIE = prod ? "__Host-medapp_session" : "medapp_session";
export const MFA_CHALLENGE_COOKIE = prod ? "__Host-medapp_mfa" : "medapp_mfa";
