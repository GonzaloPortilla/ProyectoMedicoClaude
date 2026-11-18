import "server-only";
import { headers } from "next/headers";
import type { AuditContext } from "@/server/audit/log";

/** IP y User-Agent de la request actual (para auditoría y sesiones). */
export async function requestContext(): Promise<AuditContext & { ip: string }> {
  const h = await headers();
  // Detrás de un proxy confiable, la primera IP de X-Forwarded-For es la del cliente.
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return { ip, userAgent: h.get("user-agent") };
}
