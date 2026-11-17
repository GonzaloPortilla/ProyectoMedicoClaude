/**
 * Recursos que un paciente puede compartir con un médico.
 * Un permiso es: tipo de recurso + clave + acción (ver AccessPermission en el schema).
 */
export const HEALTH_SECTIONS = [
  { key: "GENERAL", label: "Datos generales", description: "Edad, sexo, grupo sanguíneo, altura y peso" },
  { key: "ALLERGIES", label: "Alergias", description: "Alergias y reacciones" },
  { key: "CONDITIONS", label: "Antecedentes personales", description: "Enfermedades y condiciones" },
  { key: "MEDICATIONS", label: "Medicación", description: "Medicación actual" },
  { key: "FAMILY_HISTORY", label: "Antecedentes familiares", description: "Enfermedades en la familia" },
] as const;

export type HealthSectionKey = (typeof HEALTH_SECTIONS)[number]["key"];
export const HEALTH_SECTION_KEYS = HEALTH_SECTIONS.map((s) => s.key) as [HealthSectionKey, ...HealthSectionKey[]];

/** Categorías especialmente sensibles: nunca se preseleccionan. */
export const SENSITIVE_CATEGORIES = new Set(["salud-mental", "ginecologia", "urologia"]);

export type ResourceRef = { type: "HEALTH_SECTION" | "RECORD_CATEGORY"; key: string };

export function resourceId(r: ResourceRef): string {
  return `${r.type}:${r.key}`;
}

export function parseResourceId(id: string): ResourceRef | null {
  const [type, key, ...rest] = id.split(":");
  if (rest.length || !key || key.length > 60) return null;
  if (type === "HEALTH_SECTION" || type === "RECORD_CATEGORY") return { type, key };
  return null;
}

export function sectionLabel(key: string): string {
  return HEALTH_SECTIONS.find((s) => s.key === key)?.label ?? key;
}

export const DURATION_OPTIONS = [
  { value: "1h", label: "1 hora" },
  { value: "24h", label: "24 horas" },
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "permanent", label: "Permanente" },
  { value: "custom", label: "Hasta una fecha" },
] as const;

export type DurationValue = (typeof DURATION_OPTIONS)[number]["value"];

const HOUR = 60 * 60 * 1000;
const DURATION_MS: Record<Exclude<DurationValue, "permanent" | "custom">, number> = {
  "1h": HOUR,
  "24h": 24 * HOUR,
  "7d": 7 * 24 * HOUR,
  "30d": 30 * 24 * HOUR,
};

/**
 * Calcula el vencimiento. `null` = permanente.
 * Para "custom", el acceso vence al final de ese día en hora argentina (UTC−3).
 */
export function computeExpiry(duration: DurationValue, customDate: string | null, now: Date = new Date()): Date | null | "invalid" {
  if (duration === "permanent") return null;
  if (duration === "custom") {
    if (!customDate || !/^\d{4}-\d{2}-\d{2}$/.test(customDate)) return "invalid";
    const [y, m, d] = customDate.split("-").map(Number) as [number, number, number];
    const end = new Date(Date.UTC(y, m - 1, d + 1, 2, 59, 59, 999)); // 23:59:59.999 en UTC−3
    if (Number.isNaN(end.getTime()) || end <= now) return "invalid";
    if (end.getTime() - now.getTime() > 2 * 365 * 24 * HOUR) return "invalid";
    return end;
  }
  return new Date(now.getTime() + DURATION_MS[duration]);
}

/** Código de vinculación: 8 caracteres sin ambiguos (sin 0/O, 1/I/L), mostrado como XXXX-XXXX. */
export const LINK_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function normalizeLinkCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatLinkCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
