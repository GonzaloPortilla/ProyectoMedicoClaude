import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";

/**
 * Claves derivadas de APP_SECRET con HKDF: cada uso tiene su propia clave, así que
 * comprometer una (p. ej. la de URLs de archivos) no compromete las demás.
 */
type KeyPurpose = "file-url" | "mfa-secret" | "mfa-challenge";

const cache = new Map<KeyPurpose, Buffer>();

export function deriveKey(purpose: KeyPurpose): Buffer {
  let key = cache.get(purpose);
  if (!key) {
    key = Buffer.from(hkdfSync("sha256", env.APP_SECRET, "vitalia-v1", purpose, 32));
    cache.set(purpose, key);
  }
  return key;
}

export function hmac(purpose: KeyPurpose, data: string): string {
  return createHmac("sha256", deriveKey(purpose)).update(data).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** AES-256-GCM: cifrado autenticado para datos sensibles en reposo (p. ej. secretos TOTP). */
export function encrypt(purpose: KeyPurpose, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(purpose), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function decrypt(purpose: KeyPurpose, payload: string): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Formato de dato cifrado inválido");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(purpose), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
