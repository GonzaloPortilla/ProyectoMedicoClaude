import { parseLocaleNumber } from "@/server/documents/analysis/numbers";
import { matchConcept, measurementKey, normalizeLabel, type ConceptMatchCandidate } from "@/server/documents/analysis/concepts";

/**
 * Extracción de resultados de laboratorio a partir de texto (PDF u OCR).
 *
 * Reconoce líneas del tipo "Nombre  valor  unidad  referencia  [marca]" en sus variantes
 * habituales ("Glucemia: 92 mg/dL (70 - 100)", "Colesterol total ...... 238 mg/dL < 200 H",
 * "Plaquetas 245.000 /mm3 150.000 - 400.000"). No está limitado a una lista fija: un nombre
 * desconocido se acepta si tiene una unidad reconocible. Nunca interpreta clínicamente.
 */

export type ParsedLabResult = {
  originalName: string;
  valueText: string;
  valueNumeric: number | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  refText: string | null;
  /** Marca impresa en el documento ("H", "L", "*", "Alto"…). */
  documentFlag: string | null;
  line: number;
};

export type DetectedMeasurement = ParsedLabResult & {
  conceptCode: string | null;
  conceptId: string | null;
  normalizedKey: string;
  confidence: number;
};

const UNITS = [
  "x10^3/µL", "x10^3/uL", "10^3/µL", "10^3/uL", "x10^9/L", "x10^12/L", "10^6/µL", "10^6/uL", "mL/min/1.73m2", "ml/min/1,73m2",
  "mg/dL", "g/dL", "g/L", "mg/L", "µg/dL", "ug/dL", "mcg/dL", "µg/L", "ug/L", "ng/mL", "ng/dL", "pg/mL", "µUI/mL", "uUI/mL", "µUI/L",
  "mUI/mL", "mUI/L", "UI/mL", "UI/L", "U/L", "mEq/L", "mmol/L", "µmol/L", "umol/L", "nmol/L", "pmol/L", "mm/1h", "mm/1°h", "mm/h", "mm/hora",
  "mL/min", "cel/mm3", "cel/µL", "/mm3", "/mm³", "/µL", "/uL", "mg%", "g%", "fL", "pg", "seg", "%",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const UNIT_RE = new RegExp(`^(${[...UNITS].sort((a, b) => b.length - a.length).map(escape).join("|")})(?=$|[\\s),;:*])`, "i");
const UNIT_ANYWHERE_RE = new RegExp(`(?:^|\\s)(${[...UNITS].sort((a, b) => b.length - a.length).map(escape).join("|")})(?=$|[\\s),;])`, "i");

/** Palabras que indican que la línea NO es un resultado (datos administrativos). */
const STOPWORDS = /\b(fecha|protocolo|paciente|dni|documento|edad|pagina|tel|telefono|historia|afiliado|nro|numero|orden|hora|codigo|matricula|cuit|direccion|calle|piso|nacimiento|sexo|cp|ruta|km|mn|mp)\b/;
const NUMBER_RE = /(?<![\p{L}\d.,])([<>≤≥]=?\s?)?(\d[\d.,]*)(?![\p{L}\d])/gu;
const FLAG_RE = /(?:^|\s)(\*+|↑|↓|H|L|ALTO|BAJO|ELEVADO|DISMINUIDO|fuera de rango)(?=$|\s)/i;

function cleanLine(line: string): string {
  return line
    .replace(/\t/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/(?:\s?\.){3,}\s?/g, " ") // líneas de puntos "......"
    .replace(/(?:\s?_){3,}\s?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseReference(rest: string): { low: number | null; high: number | null; text: string | null; remaining: string } {
  let text = rest.replace(/^[(\[]/, "").trim();
  text = text.replace(/^(valor(?:es)? de referencia|v\.?\s?r\.?|ref(?:erencia)?\.?)\s*:?\s*/i, "");
  const num = "(\\d[\\d.,]*)";
  const range = new RegExp(`${num}\\s*(?:-|a|hasta)\\s*${num}`, "i").exec(text);
  if (range) {
    const low = parseLocaleNumber(range[1]!);
    const high = parseLocaleNumber(range[2]!);
    if (low !== null && high !== null && low <= high) {
      return { low, high, text: tidyRef(text, range.index + range[0].length), remaining: text.slice(0, range.index) + text.slice(range.index + range[0].length) };
    }
  }
  const upper = new RegExp(`(?:<=?|≤|menor (?:a|de)|hasta|inferior a)\\s*${num}`, "i").exec(text);
  if (upper) {
    const high = parseLocaleNumber(upper[1]!);
    if (high !== null) return { low: null, high, text: tidyRef(text, upper.index + upper[0].length), remaining: text.slice(0, upper.index) + text.slice(upper.index + upper[0].length) };
  }
  const lower = new RegExp(`(?:>=?|≥|mayor (?:a|de)|superior a)\\s*${num}`, "i").exec(text);
  if (lower) {
    const low = parseLocaleNumber(lower[1]!);
    if (low !== null) return { low, high: null, text: tidyRef(text, lower.index + lower[0].length), remaining: text.slice(0, lower.index) + text.slice(lower.index + lower[0].length) };
  }
  return { low: null, high: null, text: null, remaining: text };
}

/** Texto de referencia original: hasta el final del número y su unidad, sin marcas sueltas. */
function tidyRef(text: string, end: number): string {
  const after = text.slice(end);
  const unit = UNIT_RE.exec(after.trimStart());
  const full = unit ? text.slice(0, end) + after.slice(0, after.length - after.trimStart().length) + unit[0] : text.slice(0, end);
  return full.replace(/[)\]]+$/, "").trim().slice(0, 60);
}

export function parseLabLine(rawLine: string, lineNumber = 0): ParsedLabResult | null {
  const line = cleanLine(rawLine);
  if (line.length < 4 || line.length > 160) return null;

  for (const m of line.matchAll(NUMBER_RE)) {
    const index = m.index!;
    let name = line.slice(0, index).replace(/[:=]\s*$/, "").trim();
    // Marca antes del valor: "Colesterol total * 238" / "LDL H 162".
    let flag: string | null = null;
    const pre = /\s(\*+|↑|↓|H|L)$/.exec(name);
    if (pre) {
      flag = pre[1]!;
      name = name.slice(0, pre.index).trim();
    }
    name = name.replace(/[\s:\-–.,;]+$/, "").trim();
    const letters = (name.match(/\p{L}/gu) ?? []).length;
    if (letters < 2) continue;
    const normalizedName = normalizeLabel(name);
    if (!normalizedName || STOPWORDS.test(normalizedName)) return null;
    if (name.length > 50 || normalizedName.split(" ").length > 6) return null;

    const qualifier = (m[1] ?? "").replace(/\s/g, "");
    const valueNumber = parseLocaleNumber(m[2]!);
    if (valueNumber === null) return null;
    const valueText = `${qualifier}${m[2]!}`;
    let rest = line.slice(index + m[0].length).trim();

    let unit: string | null = null;
    const u = UNIT_RE.exec(rest);
    if (u) {
      unit = u[1]!;
      rest = rest.slice(u[0].length).trim();
    }

    const ref = parseReference(rest);
    if (!unit) {
      // Unidad sólo después de la referencia: "Hemoglobina 14,8 13,5 - 17,5 g/dL".
      const late = UNIT_ANYWHERE_RE.exec(rest);
      if (late) unit = late[1]!;
    }
    const remaining = ref.remaining.replace(UNIT_ANYWHERE_RE, " ");
    const post = FLAG_RE.exec(` ${remaining} `);
    if (!flag && post) flag = post[1]!;

    return {
      originalName: name,
      valueText,
      // Con calificador ("<0,5") no es un valor exacto: no se grafica.
      valueNumeric: qualifier ? null : valueNumber,
      unit,
      refLow: ref.low,
      refHigh: ref.high,
      refText: ref.text,
      documentFlag: flag,
      line: lineNumber,
    };
  }
  return null;
}

/**
 * Recorre el texto completo y devuelve los resultados detectados, con concepto normalizado
 * y una confianza estimada. Un nombre desconocido sólo se acepta si trae una unidad.
 */
export function extractLabResults<T extends ConceptMatchCandidate>(text: string, concepts: readonly T[], opts: { ocr?: boolean } = {}): DetectedMeasurement[] {
  const results: DetectedMeasurement[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const parsed = parseLabLine(raw, i + 1);
    if (!parsed) return;
    const concept = matchConcept(parsed.originalName, concepts);
    if (!concept && !parsed.unit) return;
    const normalizedKey = measurementKey(parsed.originalName, concept?.code);
    if (seen.has(normalizedKey)) return; // la primera aparición manda (evita notas al pie repetidas)
    seen.add(normalizedKey);
    let confidence = 0.45 + (concept ? 0.3 : 0) + (parsed.unit ? 0.1 : 0) + (parsed.refLow !== null || parsed.refHigh !== null ? 0.1 : 0);
    if (opts.ocr) confidence *= 0.85;
    results.push({
      ...parsed,
      conceptCode: concept?.code ?? null,
      conceptId: concept?.id ?? null,
      normalizedKey,
      confidence: Math.round(Math.min(0.99, confidence) * 100) / 100,
    });
  });
  return results;
}

/**
 * ¿El valor está fuera del rango informado POR EL LABORATORIO? Sólo compara números contra
 * la referencia impresa; no es una interpretación clínica.
 */
export function outsideReportedRange(value: number | null, low: number | null, high: number | null): boolean {
  if (value === null) return false;
  if (low !== null && value < low) return true;
  if (high !== null && value > high) return true;
  return false;
}
