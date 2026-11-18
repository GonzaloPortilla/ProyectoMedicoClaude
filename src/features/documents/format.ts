import type { ExtractionMethod } from "@/generated/prisma/enums";

/** Decimal de Prisma (o número) → número JS. */
export function num(v: { toNumber(): number } | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === "number" ? v : v.toNumber();
}

const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });
export const formatNumber = (v: number) => nf.format(v);

export function referenceLabel(low: number | null, high: number | null, unit: string | null, refText?: string | null): string | null {
  const u = unit ? ` ${unit}` : "";
  if (low !== null && high !== null) return `${formatNumber(low)} – ${formatNumber(high)}${u}`;
  if (high !== null) return `< ${formatNumber(high)}${u}`;
  if (low !== null) return `> ${formatNumber(low)}${u}`;
  return refText ?? null;
}

/**
 * Sólo describe la relación con el rango IMPRESO por el laboratorio. No interpreta:
 * los rangos varían según el laboratorio y la metodología.
 */
export function rangeNote(value: number | null, low: number | null, high: number | null, flag: string | null): string | null {
  if (value !== null && ((low !== null && value < low) || (high !== null && value > high))) return "Fuera del rango informado por el laboratorio";
  if (flag) return "Señalado en el documento original";
  return null;
}

export function methodLabel(method: ExtractionMethod | null | undefined): string {
  if (method === "PDF_TEXT") return "Extraído automáticamente del texto del PDF";
  if (method === "OCR") return "Extraído automáticamente por reconocimiento de texto (OCR)";
  return "Cargado a mano";
}

export function methodShort(method: ExtractionMethod | null | undefined): string {
  if (method === "PDF_TEXT") return "Leído del PDF";
  if (method === "OCR") return "Leído por OCR";
  return "Cargado a mano";
}

export function confidenceLabel(c: number | null | undefined): { label: string; tone: "brand" | "amber" | "neutral" } {
  if (c === null || c === undefined) return { label: "Sin estimar", tone: "neutral" };
  if (c >= 0.85) return { label: "Lectura clara", tone: "brand" };
  if (c >= 0.6) return { label: "Revisalo", tone: "amber" };
  return { label: "Lectura dudosa", tone: "amber" };
}

export const EXTRACTION_ERRORS: Record<string, string> = {
  NO_TEXT: "No encontramos texto legible en el documento.",
  OCR_FAILED: "No pudimos reconocer el texto de la imagen.",
  OCR_DISABLED: "El reconocimiento de texto de imágenes está desactivado en este servidor.",
  PDF_UNREADABLE: "No pudimos abrir el PDF para leerlo.",
  UNSUPPORTED_TYPE: "Este tipo de archivo no se puede analizar.",
  DISABLED: "El análisis automático está desactivado en este servidor.",
  INTEGRITY_MISMATCH: "El archivo guardado no coincide con su huella original. No se analizó.",
  INTERNAL_ERROR: "Ocurrió un error inesperado al analizarlo.",
};
