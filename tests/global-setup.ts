import "dotenv/config";
import { execSync } from "node:child_process";

/** Aplica las migraciones a la base de tests (si está configurada). */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  execSync("npx prisma migrate deploy", { stdio: "ignore", env: { ...process.env, DATABASE_URL: url } });
}
