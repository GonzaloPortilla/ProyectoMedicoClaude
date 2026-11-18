/**
 * Verifica la integridad de la cadena de auditoría.
 *   npm run audit:verify
 * Sale con código 1 si alguna fila fue modificada, borrada o insertada fuera de la cadena.
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const total = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM audit_events");
  const problems = await client.query<{ event_id: string; event_seq: string; problem: string }>("SELECT * FROM audit_verify_chain()");
  await client.end();
  if (problems.rowCount) {
    console.error(`✖ La cadena de auditoría NO es íntegra (${problems.rowCount} problema(s) en ${total.rows[0]!.n} eventos):`);
    for (const p of problems.rows) console.error(`  seq ${p.event_seq} (${p.event_id}): ${p.problem}`);
    process.exit(1);
  }
  console.info(`✔ Cadena de auditoría íntegra: ${total.rows[0]!.n} eventos verificados.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
