import { sectionLabel } from "@/features/access/resources";

type Perm = { resourceType: string; resourceKey: string; action: string };

/** Resume los permisos de un grant en etiquetas legibles. */
export function summarizePermissions(perms: Perm[], categoryNames: Map<string, string>) {
  const view = perms.filter((p) => p.action === "VIEW");
  return {
    sections: view.filter((p) => p.resourceType === "HEALTH_SECTION").map((p) => sectionLabel(p.resourceKey)),
    categories: view.filter((p) => p.resourceType === "RECORD_CATEGORY").map((p) => categoryNames.get(p.resourceKey) ?? p.resourceKey),
    canCreate: perms.some((p) => p.action === "CREATE_MEDICAL_ENTRY"),
    canUpload: perms.some((p) => p.action === "UPLOAD"),
  };
}

const dateTime = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
});

export function formatDateTime(date: Date): string {
  return dateTime.format(date);
}

/** "en 3 horas", "en 5 días", "vencido". */
export function relativeExpiry(expiresAt: Date | null, now: Date = new Date()): string {
  if (!expiresAt) return "Sin vencimiento";
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return "Vencido";
  const min = Math.round(ms / 60000);
  if (min < 60) return `Vence en ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `Vence en ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.round(h / 24);
  return `Vence en ${d} días`;
}

export const EXPIRING_SOON_MS = 72 * 60 * 60 * 1000;

export function isExpiringSoon(expiresAt: Date | null, now: Date = new Date()) {
  return !!expiresAt && expiresAt.getTime() - now.getTime() <= EXPIRING_SOON_MS;
}

export const ACCESS_LOG_LABELS: Record<string, string> = {
  PATIENT_SUMMARY_VIEWED: "Vio tu resumen",
  RECORD_VIEWED: "Abrió un registro",
  FILE_VIEWED: "Abrió un archivo",
  FILE_DOWNLOADED: "Descargó un archivo",
  REPORT_CREATED: "Creó un informe",
  REPORT_CORRECTED: "Corrigió un informe",
};
