import "server-only";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

function loadEnv() {
  const parsed = envSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    APP_URL: process.env.APP_URL || undefined,
    NODE_ENV: process.env.NODE_ENV,
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Configuración incompleta (${missing}). Creá el archivo .env a partir de .env.example ` +
        `(Windows: "Copy-Item .env.example .env"; macOS/Linux: "cp .env.example .env") y reiniciá el servidor.`,
    );
  }
  return parsed.data;
}

/** Variables de entorno validadas. Falla rápido, con un mensaje claro, si falta algo crítico. */
export const env = loadEnv();
