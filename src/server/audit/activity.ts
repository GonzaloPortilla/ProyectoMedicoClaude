import "server-only";
import type { AuditAction, Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { describeUserAgent } from "@/server/audit/net";
import { formatDate } from "@/lib/utils";
import { HEALTH_SECTIONS } from "@/features/access/resources";
import { KIND_CONFIG, type HealthKind } from "@/features/health/config";

/**
 * "Actividad de mi cuenta": traduce eventos de auditoría a frases comprensibles.
 *
 * Alcance (nunca más que esto):
 *  - eventos donde el usuario es el ACTOR, y
 *  - si es paciente, eventos sobre SUS datos (subjectPatientId), hechos por quien sea.
 * Los títulos de registros clínicos sólo se muestran al paciente dueño; para cualquier otro
 * observador se muestra la categoría (un médico no vuelve a ver títulos tras perder el acceso).
 */

export type ActivityFilter = "all" | "doctors" | "security" | "mine";

export type ActivityItem = {
  id: string;
  at: Date;
  text: string;
  detail: string | null;
  tone: "doctor" | "security" | "self" | "system" | "warning";
};

const SECURITY_ACTIONS: AuditAction[] = [
  "LOGIN_SUCCEEDED", "LOGIN_FAILED", "LOGIN_LOCKED", "LOGOUT", "SESSION_REVOKED", "MFA_CHALLENGE_FAILED", "MFA_ENABLED",
  "MFA_DISABLED", "MFA_RECOVERY_CODE_USED", "PASSWORD_CHANGED", "PASSWORD_RESET_REQUESTED", "PASSWORD_RESET_COMPLETED",
  "EMAIL_VERIFIED", "ACCOUNT_REGISTERED", "DATA_EXPORTED",
];

const FIELD_LABELS: Record<string, string> = {
  dateOfBirth: "fecha de nacimiento", sex: "sexo", documentId: "documento", phone: "teléfono", province: "provincia", city: "ciudad",
  bloodType: "grupo sanguíneo", heightCm: "altura", weightKg: "peso", firstName: "nombre", lastName: "apellido",
};

const LOGIN_REASONS: Record<string, string> = {
  bad_password: "contraseña incorrecta",
  locked: "cuenta bloqueada temporalmente",
  email_not_verified: "email sin verificar",
  suspended: "cuenta suspendida",
};

type Meta = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : null);

export async function listActivity(opts: { userId: string; patientId: string | null; filter: ActivityFilter; before?: bigint; take?: number }) {
  const take = Math.min(opts.take ?? 50, 100);
  const scope: Prisma.AuditEventWhereInput[] = [{ actorUserId: opts.userId }];
  if (opts.patientId) scope.push({ subjectPatientId: opts.patientId });

  const filterWhere: Prisma.AuditEventWhereInput =
    opts.filter === "doctors"
      ? { subjectPatientId: opts.patientId ?? "__none__", OR: [{ actorType: "DOCTOR" }, { action: { in: ["ACCESS_GRANTED", "ACCESS_REJECTED", "ACCESS_REVOKED", "ACCESS_EXPIRED"] } }] }
      : opts.filter === "security"
        ? { action: { in: SECURITY_ACTIONS } }
        : opts.filter === "mine"
          ? { actorUserId: opts.userId }
          : {};

  const events = await db.auditEvent.findMany({
    where: { AND: [{ OR: scope }, filterWhere, opts.before ? { seq: { lt: opts.before } } : {}] },
    orderBy: { seq: "desc" },
    take: take + 1,
    select: { id: true, seq: true, createdAt: true, action: true, outcome: true, actorType: true, actorUserId: true, subjectPatientId: true, resourceType: true, resourceId: true, grantId: true, ip: true, userAgent: true, metadata: true },
  });
  const page = events.slice(0, take);
  const nextCursor = events.length > take ? page[page.length - 1]!.seq.toString() : null;

  // ── Resolución de nombres (en lote) ──
  const ids = <T,>(xs: (T | null | undefined)[]) => [...new Set(xs.filter((x): x is T => !!x))];
  const grantIds = ids(page.map((e) => e.grantId));
  const requestIds = ids(page.filter((e) => e.resourceType === "ACCESS_REQUEST").map((e) => e.resourceId));
  const [grants, requests] = await Promise.all([
    grantIds.length ? db.accessGrant.findMany({ where: { id: { in: grantIds } }, select: { id: true, doctorUserId: true, expiresAt: true } }) : [],
    requestIds.length ? db.accessRequest.findMany({ where: { id: { in: requestIds } }, select: { id: true, doctorUserId: true } }) : [],
  ]);
  const userIds = ids([...page.map((e) => e.actorUserId), ...grants.map((g) => g.doctorUserId), ...requests.map((r) => r.doctorUserId)]);
  const fileIds = ids(page.filter((e) => e.resourceType === "MEDICAL_FILE").map((e) => e.resourceId));
  const files = fileIds.length ? await db.medicalFile.findMany({ where: { id: { in: fileIds } }, select: { id: true, recordId: true } }) : [];
  const recordIds = ids([...page.filter((e) => e.resourceType === "MEDICAL_RECORD").map((e) => e.resourceId), ...files.map((f) => f.recordId)]);
  const patientIds = ids(page.map((e) => e.subjectPatientId));
  const [users, records, categories, patients] = await Promise.all([
    userIds.length ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, doctorProfile: { select: { id: true } } } }) : [],
    recordIds.length ? db.medicalRecord.findMany({ where: { id: { in: recordIds } }, select: { id: true, patientId: true, title: true, occurredOn: true, category: { select: { name: true } } } }) : [],
    db.medicalCategory.findMany({ select: { slug: true, name: true } }),
    patientIds.length ? db.patientProfile.findMany({ where: { id: { in: patientIds } }, select: { id: true, user: { select: { firstName: true, lastName: true } } } }) : [],
  ]);

  const userName = (id: string | null | undefined) => {
    const u = users.find((x) => x.id === id);
    if (!u) return "Un usuario eliminado";
    return `${u.doctorProfile ? "Dr/a. " : ""}${u.firstName} ${u.lastName}`;
  };
  const catName = (slug: unknown) => categories.find((c) => c.slug === slug)?.name ?? "otra categoría";
  const patientName = (id: string | null) => {
    const p = patients.find((x) => x.id === id);
    return p ? `${p.user.firstName} ${p.user.lastName}` : "un paciente";
  };

  /** Descripción del recurso clínico según quién mira. */
  const recordRef = (e: (typeof page)[number], meta: Meta) => {
    const recordId = e.resourceType === "MEDICAL_FILE" ? files.find((f) => f.id === e.resourceId)?.recordId : e.resourceId;
    const record = records.find((r) => r.id === recordId);
    const ownerIsViewer = !!opts.patientId && e.subjectPatientId === opts.patientId;
    if (record && ownerIsViewer) return `«${record.title} — ${formatDate(record.occurredOn)}»`;
    const date = str(meta.occurredOn) ? ` del ${formatDate(new Date(`${meta.occurredOn}T00:00:00Z`))}` : record ? ` del ${formatDate(record.occurredOn)}` : "";
    const cat = record ? record.category.name : catName(meta.categorySlug);
    return ownerIsViewer ? `un registro de ${cat}${date} que ya fue eliminado` : `un registro de ${cat}${date} de ${patientName(e.subjectPatientId)}`;
  };

  const items: ActivityItem[] = page.map((e) => {
    const meta = (e.metadata ?? {}) as Meta;
    const self = e.actorUserId === opts.userId;
    const actor = self ? "Vos" : userName(e.actorUserId);
    const grantDoctor = userName(grants.find((g) => g.id === e.grantId)?.doctorUserId ?? requests.find((r) => r.id === e.resourceId)?.doctorUserId);
    const device = e.userAgent || e.ip ? [e.userAgent ? describeUserAgent(e.userAgent) : null, e.ip ? `IP ${e.ip.replace(/\.0$/, ".x")}` : null].filter(Boolean).join(" · ") : null;
    const v = (selfVerb: string, otherVerb: string) => (self ? selfVerb : `${actor} ${otherVerb}`);
    const tone: ActivityItem["tone"] = e.outcome !== "SUCCESS" ? "warning" : e.actorType === "DOCTOR" && !self ? "doctor" : e.actorType === "SYSTEM" ? "system" : SECURITY_ACTIONS.includes(e.action) ? "security" : "self";
    let text: string;
    let detail: string | null = null;

    switch (e.action) {
      case "PATIENT_SUMMARY_VIEWED":
        text = self ? `Viste el resumen de ${patientName(e.subjectPatientId)}` : `${actor} accedió a tu historial`;
        break;
      case "RECORD_VIEWED":
        text = `${v("Viste", "visualizó")} ${recordRef(e, meta)}`;
        break;
      case "FILE_VIEWED":
        text = `${v("Abriste", "abrió")} el archivo de ${recordRef(e, meta)}`;
        break;
      case "FILE_DOWNLOADED":
        text = `${v("Descargaste", "descargó")} el archivo de ${recordRef(e, meta)}`;
        break;
      case "RECORD_CREATED":
        text = `${v("Subiste", "agregó")} ${recordRef(e, meta)}`;
        break;
      case "RECORD_DELETED":
        text = `${v("Eliminaste", "eliminó")} un registro de ${catName(meta.categorySlug)}${str(meta.occurredOn) ? ` del ${formatDate(new Date(`${meta.occurredOn}T00:00:00Z`))}` : ""}`;
        break;
      case "REPORT_CREATED":
        text = `${v("Creaste", "creó")} el informe ${recordRef(e, meta)}`;
        break;
      case "REPORT_CORRECTED":
        text = `${v("Corregiste", "corrigió")} el informe ${recordRef(e, meta)}`;
        detail = meta.fromVersion ? `Versión ${meta.fromVersion} → ${meta.toVersion}. La versión anterior se conserva.` : null;
        break;
      case "ACCESS_REQUESTED":
        text = e.outcome === "SUCCESS" ? (self ? `Solicitaste acceso a ${patientName(e.subjectPatientId)}` : `${actor} solicitó acceso a tu información`) : "Intentaste vincular un paciente con un código inválido o vencido";
        break;
      case "ACCESS_REQUEST_CANCELLED":
        text = self ? "Cancelaste una solicitud de acceso" : `${actor} canceló su solicitud de acceso`;
        break;
      case "ACCESS_GRANTED": {
        text = self ? `Autorizaste a ${grantDoctor}` : `${actor} te autorizó a ver su información`;
        const sections = Array.isArray(meta.sections) ? (meta.sections as string[]).map((k) => HEALTH_SECTIONS.find((s) => s.key === k)?.label ?? k) : [];
        const cats = Array.isArray(meta.categories) ? (meta.categories as string[]).map(catName) : [];
        const until = str(meta.expiresAt) === "permanent" ? "sin vencimiento" : str(meta.expiresAt) ? `hasta el ${formatDate(new Date(meta.expiresAt as string))}` : null;
        detail = [[...sections, ...cats].join(", "), until].filter(Boolean).join(" · ") || null;
        break;
      }
      case "ACCESS_REJECTED":
        text = `Rechazaste la solicitud de ${grantDoctor}`;
        break;
      case "ACCESS_REVOKED":
        text = self ? `Revocaste el acceso de ${grantDoctor}` : `${actor} revocó tu acceso`;
        break;
      case "ACCESS_EXPIRED":
        text = opts.patientId && e.subjectPatientId === opts.patientId ? `Venció el acceso de ${grantDoctor}` : `Venció tu acceso a ${patientName(e.subjectPatientId)}`;
        break;
      case "ACCESS_DENIED":
        text = self ? `Se te negó el acceso a ${patientName(e.subjectPatientId)} (sin autorización vigente)` : `${actor} intentó acceder a tu información sin una autorización vigente`;
        detail = self ? null : "No se le mostró ningún dato.";
        break;
      case "LINK_CODE_CREATED":
        text = "Generaste un código de vinculación";
        break;
      case "HEALTH_ENTRY_CREATED":
      case "HEALTH_ENTRY_DELETED": {
        const kind = str(meta.kind) as HealthKind | null;
        text = `${e.action === "HEALTH_ENTRY_CREATED" ? "Agregaste" : "Eliminaste"} un dato de Mi salud${kind && KIND_CONFIG[kind] ? ` (${KIND_CONFIG[kind].title})` : ""}`;
        break;
      }
      case "PROFILE_UPDATED": {
        const fields = Array.isArray(meta.fields) ? (meta.fields as string[]).map((f) => FIELD_LABELS[f] ?? f) : [];
        text = meta.kind === "vitals" ? "Actualizaste tus datos básicos de salud" : "Actualizaste tu perfil";
        detail = fields.length ? `Campos: ${fields.join(", ")}` : null;
        break;
      }
      case "EMERGENCY_SETTINGS_UPDATED":
        text = "Cambiaste qué se muestra en tu información de emergencia";
        break;
      case "LOGIN_SUCCEEDED":
        text = meta.method === "recovery_code" ? "Iniciaste sesión con un código de recuperación" : "Iniciaste sesión";
        detail = device;
        break;
      case "LOGIN_FAILED":
        text = "Intento fallido de inicio de sesión";
        detail = [LOGIN_REASONS[str(meta.reason) ?? ""] ?? null, device].filter(Boolean).join(" · ") || null;
        break;
      case "LOGIN_LOCKED":
        text = `Bloqueamos el acceso a tu cuenta por ${meta.lockedMinutes ?? 15} minutos`;
        detail = "Hubo varios intentos fallidos seguidos.";
        break;
      case "LOGOUT":
        text = "Cerraste sesión";
        break;
      case "SESSION_REVOKED":
        text = meta.sessionsRevoked ? `Cerraste ${meta.sessionsRevoked} ${meta.sessionsRevoked === 1 ? "sesión" : "sesiones"} en otros dispositivos` : "Cerraste una sesión en otro dispositivo";
        break;
      case "MFA_ENABLED":
        text = "Activaste la verificación en dos pasos";
        break;
      case "MFA_DISABLED":
        text = "Desactivaste la verificación en dos pasos";
        break;
      case "MFA_CHALLENGE_FAILED":
        text = "Código de verificación en dos pasos incorrecto";
        detail = device;
        break;
      case "MFA_RECOVERY_CODE_USED":
        text = "Usaste un código de recuperación";
        break;
      case "PASSWORD_CHANGED":
        text = e.outcome === "SUCCESS" ? "Cambiaste tu contraseña" : "Intento fallido de cambio de contraseña";
        break;
      case "PASSWORD_RESET_REQUESTED":
        text = "Se pidió un enlace para restablecer tu contraseña";
        break;
      case "PASSWORD_RESET_COMPLETED":
        text = "Restableciste tu contraseña";
        detail = "Se cerraron todas tus sesiones.";
        break;
      case "EMAIL_VERIFIED":
        text = "Verificaste tu email";
        break;
      case "ACCOUNT_REGISTERED":
        text = "Creaste tu cuenta";
        break;
      case "DATA_EXPORTED":
        text = "Descargaste una copia de tus datos";
        break;
      case "DOCTOR_VERIFICATION_DECIDED":
        text = meta.decision === "VERIFIED" ? "Verificaste la matrícula de un profesional" : "Rechazaste la verificación de un profesional";
        break;
      default:
        text = e.action;
    }
    return { id: e.id, at: e.createdAt, text, detail, tone };
  });

  return { items, nextCursor };
}
