import "server-only";
import { hash, verify } from "@node-rs/argon2";

// Argon2id (algoritmo por defecto de @node-rs/argon2) con parámetros
// recomendados por OWASP: 19 MiB de memoria, 2 iteraciones, 1 hilo.
const ARGON2_OPTIONS = {
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

// Hash de referencia para igualar el tiempo de respuesta cuando el usuario no existe
// (evita enumerar emails registrados midiendo tiempos).
let dummyHash: Promise<string> | undefined;
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("dummy-password-for-timing-equalization");
  await verifyPassword(await dummyHash, password);
  return false;
}
