import "server-only";
import { hash, verify } from "@node-rs/argon2";

// Argon2id (algoritmo por defecto de @node-rs/argon2) con parámetros recomendados por
// OWASP: 19 MiB de memoria, 2 iteraciones, 1 hilo.
export const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * ¿El hash se generó con parámetros más débiles que los actuales (o con otro algoritmo)?
 * Si es así, se vuelve a hashear en el próximo login exitoso.
 */
export function needsRehash(passwordHash: string): boolean {
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(passwordHash);
  if (!m) return true;
  const [, mem, time, par] = m.map(Number);
  return mem! < ARGON2_OPTIONS.memoryCost || time! < ARGON2_OPTIONS.timeCost || par !== ARGON2_OPTIONS.parallelism;
}

// Hash de referencia para igualar el tiempo de respuesta cuando el usuario no existe
// (evita enumerar emails registrados midiendo tiempos).
let dummyHash: Promise<string> | undefined;
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("dummy-password-for-timing-equalization");
  await verifyPassword(await dummyHash, password);
  return false;
}
