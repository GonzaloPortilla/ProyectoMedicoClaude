import "server-only";
import type { AuditAction, AuditActorType, AuditOutcome, Role } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { anonymizeIp } from "@/server/audit/net";

/**
 * Registro de auditoría.
 *
 * ÚNICA forma de escribir en audit_events. Principios:
 * - Minimización: sólo identificadores y metadatos de una LISTA BLANCA. Nunca contenidos
 *   clínicos, títulos, nombres de archivo, emails, contraseñas, tokens ni códigos.
 * - IP anonimizada y User-Agent truncado.
 * - La base encadena (hash) y protege cada fila; desde la app sólo se puede insertar.
 * - Un fallo al auditar nunca debe romper la operación del usuario, pero se reporta.
 */

export type AuditContext = { ip?: string | null; userAgent?: string | null };

export type AuditInput = {
  action: AuditAction;
  outcome?: AuditOutcome;
  actorType: AuditActorType;
  actorUserId?: string | null;
  subjectPatientId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  grantId?: string | null;
  metadata?: Record<string, unknown>;
};

/** Claves de metadata permitidas. Agregar una clave nueva es una decisión consciente de privacidad. */
const ALLOWED_METADATA_KEYS = new Set([
  "reason",
  "method",
  "kind",
  "categorySlug",
  "occurredOn",
  "fromVersion",
  "toVersion",
  "decision",
  "duration",
  "expiresAt",
  "sections",
  "categories",
  "allowCreate",
  "allowUpload",
  "fields",
  "sessionsRevoked",
  "lockedMinutes",
  "disposition",
  "fileCount",
  "mimeType",
  "role",
  "migratedFrom",
]);

function sanitizeMetadata(meta: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  if (!meta) return undefined;
  const out: Record<string, string | number | boolean | string[]> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!ALLOWED_METADATA_KEYS.has(key) || value === undefined || value === null) continue;
    if (typeof value === "string") out[key] = value.slice(0, 80);
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
    else if (value instanceof Date) out[key] = value.toISOString();
    else if (Array.isArray(value)) out[key] = value.filter((v) => typeof v === "string").slice(0, 40).map((v) => (v as string).slice(0, 60));
  }
  return Object.keys(out).length ? out : undefined;
}

export function actorTypeFor(roles: readonly Role[] | undefined, prefer?: Role): AuditActorType {
  if (!roles?.length) return "ANONYMOUS";
  if (prefer && roles.includes(prefer)) return prefer;
  if (roles.includes("ADMIN")) return "ADMIN";
  if (roles.includes("DOCTOR")) return "DOCTOR";
  return "PATIENT";
}

export async function audit(input: AuditInput, ctx: AuditContext = {}): Promise<void> {
  try {
    await db.auditEvent.create({
      data: {
        action: input.action,
        outcome: input.outcome ?? "SUCCESS",
        actorType: input.actorType,
        actorUserId: input.actorUserId ?? null,
        subjectPatientId: input.subjectPatientId ?? null,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId?.slice(0, 64) ?? null,
        grantId: input.grantId ?? null,
        ip: anonymizeIp(ctx.ip),
        userAgent: ctx.userAgent?.slice(0, 200) ?? null,
        metadata: sanitizeMetadata(input.metadata),
      },
    });
  } catch (error) {
    // No se registra el contenido del evento para no filtrar datos en los logs del servidor.
    console.error("[audit] No se pudo registrar el evento", input.action, error instanceof Error ? error.message : "error");
  }
}
