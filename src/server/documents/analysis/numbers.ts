/**
 * Números tal como aparecen en informes argentinos y extranjeros.
 *  "14,8" → 14.8 · "6.800" → 6800 · "245.000" → 245000 · "1.234,5" → 1234.5 · "0.9" → 0.9
 */
export function parseLocaleNumber(raw: string): number | null {
  const s = raw.replace(/\s+/g, "").replace(/^[<>≤≥]=?/, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  let normalized: string;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // El último separador es el decimal.
    normalized = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = /^\d{1,3}(,\d{3})+$/.test(s) && s.split(",").length > 2 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot >= 0) {
    // "6.800" / "245.000" (separador de miles) vs. "0.9" / "14.8" (decimal).
    normalized = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
  } else {
    normalized = s;
  }
  if ((normalized.match(/\./g) ?? []).length > 1) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
