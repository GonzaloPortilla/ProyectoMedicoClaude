import "server-only";
import { z } from "zod";

const DEV_PLACEHOLDER_SECRET = "dev-only-insecure-secret-change-me-0123456789abcdef";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Secreto del servidor (≥ 32 caracteres). Se derivan subclaves para cada uso (HKDF). */
  APP_SECRET: z.string().min(32, "APP_SECRET debe tener al menos 32 caracteres"),
  /** Roles que deben usar MFA obligatoriamente (separados por coma). */
  MFA_REQUIRED_ROLES: z.string().default(""),
});

function loadEnv() {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const parsed = envSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    APP_URL: process.env.APP_URL || undefined,
    NODE_ENV: nodeEnv,
    // En desarrollo/test se admite un secreto de ejemplo para que el proyecto arranque sin pasos extra.
    APP_SECRET: process.env.APP_SECRET || (nodeEnv === "production" ? undefined : DEV_PLACEHOLDER_SECRET),
    // Por defecto, en producción los administradores deben usar MFA.
    MFA_REQUIRED_ROLES: process.env.MFA_REQUIRED_ROLES ?? (nodeEnv === "production" ? "ADMIN" : ""),
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Configuración incompleta (${missing}). Creá el archivo .env a partir de .env.example ` +
        `(Windows: "Copy-Item .env.example .env"; macOS/Linux: "cp .env.example .env") y reiniciá el servidor.`,
    );
  }
  const data = parsed.data;
  // Durante `next build` no se usa ningún secreto; el control se aplica al arrancar el servidor.
  const building = process.env.NEXT_PHASE === "phase-production-build";
  if (!building && data.NODE_ENV === "production" && (data.APP_SECRET === DEV_PLACEHOLDER_SECRET || data.APP_SECRET.startsWith("dev-only"))) {
    throw new Error("APP_SECRET de ejemplo en producción. Generá uno propio (por ejemplo: openssl rand -base64 48).");
  }
  return {
    ...data,
    mfaRequiredRoles: data.MFA_REQUIRED_ROLES.split(",").map((r) => r.trim().toUpperCase()).filter(Boolean),
  };
}

/** Variables de entorno validadas. Falla rápido, con un mensaje claro, si falta algo crítico. */
export const env = loadEnv();
