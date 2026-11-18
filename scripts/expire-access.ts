/**
 * Marca como vencidos los accesos médicos cuyo plazo terminó y lo registra en la auditoría.
 * La política ya bloquea los accesos vencidos al instante; esto sólo deja constancia.
 * Pensado para correr periódicamente (cron, cada 5–15 minutos):
 *   npm run jobs:expire-access
 */
import "dotenv/config";
import { sweepExpiredGrants } from "@/server/access/expiry";
import { db } from "@/server/db";

sweepExpiredGrants()
  .then((n) => console.info(`Accesos marcados como vencidos: ${n}`))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
