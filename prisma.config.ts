import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // `prisma generate` (que corre en `npm install`) no necesita base de datos, así que no
    // se exige DATABASE_URL acá. Los comandos que sí la usan (migrate, seed) fallan con un
    // error claro si falta. Ver README → "Inicio rápido".
    url: process.env.DATABASE_URL ?? "",
  },
});
