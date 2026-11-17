/** Minúsculas, sin acentos y con espacios colapsados: base de la búsqueda y la deduplicación. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "Control anual, Sangre ,  control anual" → ["control anual", "sangre"] */
export function parseTags(raw: string | null | undefined, max = 10): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const tag = part.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 30);
    if (tag) seen.add(tag);
    if (seen.size >= max) break;
  }
  return [...seen];
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** "YYYY-MM-DD" → Date UTC (o null). */
export function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

export function toDateInput(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}
