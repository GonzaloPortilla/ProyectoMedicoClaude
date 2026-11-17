import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** Token aleatorio de 256 bits, apto para URL y cookies. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Los tokens se guardan en la base sólo como SHA-256: un volcado de la DB no permite usarlos. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
