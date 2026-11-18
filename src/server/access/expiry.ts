import "server-only";
import { db } from "@/server/db";
import { audit } from "@/server/audit/log";

/**
 * Barrido de vencimientos: marca como EXPIRED los accesos cuyo plazo terminó y deja
 * registro en la auditoría ("El acceso de Dr. X venció").
 *
 * IMPORTANTE: no es lo que bloquea el acceso. La política (src/server/access/policy.ts)
 * ya rechaza un acceso vencido en el mismo instante en que vence. El barrido sólo deja
 * constancia y ordena los estados. Corre al abrir pantallas relevantes y puede programarse
 * con `npm run jobs:expire-access`.
 */
export async function sweepExpiredGrants(now: Date = new Date(), limit = 200): Promise<number> {
  const due = await db.accessGrant.findMany({
    where: { status: "ACTIVE", revokedAt: null, expiresAt: { lte: now } },
    select: { id: true, patientId: true, doctorUserId: true, expiresAt: true },
    take: limit,
  });
  let expired = 0;
  for (const g of due) {
    const { count } = await db.accessGrant.updateMany({ where: { id: g.id, status: "ACTIVE" }, data: { status: "EXPIRED" } });
    if (count !== 1) continue; // otro proceso ya lo marcó: no duplicar el evento
    expired++;
    await audit({
      action: "ACCESS_EXPIRED",
      actorType: "SYSTEM",
      subjectPatientId: g.patientId,
      resourceType: "ACCESS_GRANT",
      resourceId: g.id,
      grantId: g.id,
      metadata: { expiresAt: g.expiresAt!.toISOString() },
    });
  }
  return expired;
}
