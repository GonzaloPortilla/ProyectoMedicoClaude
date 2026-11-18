import { normalizeLabel } from "@/server/documents/analysis/concepts";

/**
 * Detección de metadatos de un estudio (título, fecha, tipo, institución, profesional,
 * especialidad) a partir del texto y del nombre del archivo. Todo es una PROPUESTA con su
 * confianza: el paciente la revisa y la confirma antes de que cambie su historial.
 */

export type SuggestionSource = "text" | "filename";
export type Suggestion<T> = { value: T; confidence: number; source: SuggestionSource };

export type DocumentSuggestions = {
  title: Suggestion<string> | null;
  occurredOn: Suggestion<string> | null; // YYYY-MM-DD
  categorySlug: Suggestion<string> | null;
  specialty: Suggestion<string> | null;
  institution: Suggestion<string> | null;
  professional: Suggestion<string> | null;
};

const MONTHS: Record<string, number> = {
  enero: 1, ene: 1, january: 1, jan: 1,
  febrero: 2, feb: 2, february: 2,
  marzo: 3, mar: 3, march: 3,
  abril: 4, abr: 4, april: 4, apr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6, june: 6,
  julio: 7, jul: 7, july: 7,
  agosto: 8, ago: 8, august: 8, aug: 8,
  septiembre: 9, setiembre: 9, sep: 9, sept: 9, set: 9, september: 9,
  octubre: 10, oct: 10, october: 10,
  noviembre: 11, nov: 11, november: 11,
  diciembre: 12, dic: 12, december: 12, dec: 12,
};

function isoDate(y: number, m: number, d: number, now: Date): string | null {
  if (y < 100) y += y > (now.getUTCFullYear() % 100) + 1 ? 1900 : 2000;
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (date > tomorrow) return null;
  return date.toISOString().slice(0, 10);
}

/** Todas las fechas de una línea, en orden de aparición. */
export function findDates(line: string, now = new Date()): string[] {
  const out: { index: number; iso: string }[] = [];
  const n = line;
  for (const m of n.matchAll(/(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/g)) {
    const iso = isoDate(Number(m[3]), Number(m[2]), Number(m[1]), now);
    if (iso) out.push({ index: m.index!, iso });
  }
  for (const m of n.matchAll(/(?<!\d)(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?!\d)/g)) {
    const iso = isoDate(Number(m[1]), Number(m[2]), Number(m[3]), now);
    if (iso) out.push({ index: m.index!, iso });
  }
  const plain = line.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  for (const m of plain.matchAll(/(?<!\d)(\d{1,2})(?:\s+de)?\s+([a-z]{3,10})\.?(?:\s+de(?:l)?)?\s+(\d{4})(?!\d)/g)) {
    const month = MONTHS[m[2]!];
    const iso = month ? isoDate(Number(m[3]), month, Number(m[1]), now) : null;
    if (iso) out.push({ index: m.index!, iso });
  }
  return out.sort((a, b) => a.index - b.index).map((x) => x.iso);
}

function detectDate(lines: string[], now: Date): Suggestion<string> | null {
  let best: Suggestion<string> & { order: number } | null = null;
  lines.forEach((line, order) => {
    const norm = normalizeLabel(line);
    if (/\b(nac|nacimiento|f nac|nacido)\b/.test(norm)) return; // nunca la fecha de nacimiento
    const dates = findDates(line, now);
    if (!dates.length) return;
    const confidence = /fecha (de )?(extraccion|toma|realizacion|del estudio|de atencion|de muestra|del informe|de emision|de ingreso)/.test(norm)
      ? 0.92
      : /\bfecha\b/.test(norm)
        ? 0.8
        : 0.55;
    if (!best || confidence > best.confidence) best = { value: dates[0]!, confidence, source: "text", order };
  });
  if (!best) return null;
  const { order, ...rest } = best as Suggestion<string> & { order: number };
  void order;
  return rest;
}

const INSTITUTION_RE = /\b(laboratorio|clinica|hospital|sanatorio|centro|instituto|diagnostico|policlinico|consultorio|fundacion|imagenes)\b/;

function detectInstitution(lines: string[], ocr: boolean): Suggestion<string> | null {
  for (const line of lines.slice(0, 12)) {
    const norm = normalizeLabel(line);
    if (!INSTITUTION_RE.test(norm) || /\b(paciente|fecha|protocolo|medico|solicitante|dr|dra)\b/.test(norm)) continue;
    if (line.length > 80 || /\d{3,}/.test(line)) continue;
    // "Laboratorio de análisis clínicos" o "Análisis de laboratorio" son títulos, no instituciones.
    if (/^(analisis|informe|estudio|resultado|perfil)/.test(norm)) continue;
    const value = line.replace(/\s+/g, " ").replace(/^[\s\-–|•]+|[\s\-–|•]+$/g, "").trim();
    if (value.length >= 4) return { value, confidence: ocr ? 0.6 : 0.72, source: "text" };
  }
  return null;
}

// Nombre: de 1 a 4 palabras con mayúscula inicial, separadas por espacios (corta en el primer punto).
const NAME = "[A-ZÁÉÍÓÚÑ][\\p{L}'-]+(?: [A-ZÁÉÍÓÚÑ][\\p{L}'-]+){0,3}";
const PRO_RE = new RegExp(`\\b(Dra?\\.?|Doctora?|Bioq(?:u[ií]mic[oa])?\\.?|Lic\\.?)\\s+(${NAME})`, "u");
// Sin flag "i": la mayúscula inicial del nombre es la que delimita dónde termina.
const PRO_LABEL_RE = new RegExp(`(?:[Mm][ée]dic[oa] [Ss]olicitante|[Ss]olicitado por|[Pp]rofesional|[Ff]irmado por|[Mm][ée]dic[oa]|M[ÉE]DIC[OA] SOLICITANTE)\\s*:\\s*((?:Dra?\\.?\\s+)?${NAME})`, "u");

function detectProfessional(lines: string[], ocr: boolean): Suggestion<string> | null {
  for (const line of lines) {
    const labeled = PRO_LABEL_RE.exec(line);
    if (labeled) return { value: labeled[1]!.trim(), confidence: ocr ? 0.65 : 0.78, source: "text" };
  }
  for (const line of lines) {
    const m = PRO_RE.exec(line);
    if (m) {
      const prefix = m[1]!.replace(/\.?$/, ".");
      return { value: `${prefix} ${m[2]!.trim()}`.replace(/\s+/g, " "), confidence: ocr ? 0.55 : 0.68, source: "text" };
    }
  }
  return null;
}

type CategoryRule = { slug: string; specialty: string | null; title: string; keywords: string[] };

const CATEGORY_RULES: CategoryRule[] = [
  { slug: "laboratorio", specialty: null, title: "Análisis de laboratorio", keywords: ["laboratorio", "analisis", "hemograma", "glucemia", "glucosa", "colesterol", "trigliceridos", "hematocrito", "hemoglobina", "creatinina", "uremia", "orina", "perfil lipidico", "tsh", "bioquimic", "determinacion"] },
  { slug: "diagnostico-por-imagenes", specialty: "Diagnóstico por imágenes", title: "Estudio por imágenes", keywords: ["radiografia", "rx", "ecografia", "tomografia", "resonancia", "mamografia", "densitometria", "rmn", "tac", "imagenes"] },
  { slug: "cardiologia", specialty: "Cardiología", title: "Estudio cardiológico", keywords: ["electrocardiograma", "ecg", "ecocardiograma", "holter", "ergometria", "cardiolog", "presurometria", "mapa"] },
  { slug: "recetas", specialty: null, title: "Receta", keywords: ["receta", "rp", "prescripcion", "posologia", "comprimidos"] },
  { slug: "odontologia", specialty: "Odontología", title: "Estudio odontológico", keywords: ["odontolog", "dental", "panoramica dental"] },
  { slug: "oftalmologia", specialty: "Oftalmología", title: "Estudio oftalmológico", keywords: ["oftalmolog", "agudeza visual", "fondo de ojo", "campo visual"] },
  { slug: "dermatologia", specialty: "Dermatología", title: "Estudio dermatológico", keywords: ["dermatolog", "dermatoscopia"] },
  { slug: "neurologia", specialty: "Neurología", title: "Estudio neurológico", keywords: ["neurolog", "electroencefalograma", "eeg"] },
  { slug: "gastroenterologia", specialty: "Gastroenterología", title: "Estudio gastroenterológico", keywords: ["gastroenterolog", "endoscopia", "colonoscopia", "videoendoscopia"] },
  { slug: "ginecologia", specialty: "Ginecología", title: "Estudio ginecológico", keywords: ["ginecolog", "papanicolau", "colposcopia"] },
  { slug: "urologia", specialty: "Urología", title: "Estudio urológico", keywords: ["urolog", "espermograma"] },
  { slug: "traumatologia", specialty: "Traumatología", title: "Estudio traumatológico", keywords: ["traumatolog", "fractura"] },
  { slug: "vacunas", specialty: null, title: "Certificado de vacunación", keywords: ["vacuna", "vacunacion", "inmunizacion"] },
];

function countHits(text: string, keyword: string): number {
  // Prefijos ("cardiolog") o palabras completas ("rx").
  const re = keyword.length <= 4 ? new RegExp(`\\b${keyword}\\b`, "g") : new RegExp(`\\b${keyword}`, "g");
  return (text.match(re) ?? []).length;
}

function detectCategory(head: string, body: string, filename: string, labResultCount: number, available: readonly string[]) {
  let best: { rule: CategoryRule; score: number } | null = null;
  for (const rule of CATEGORY_RULES) {
    if (!available.includes(rule.slug)) continue;
    let score = 0;
    for (const k of rule.keywords) score += Math.min(3, countHits(body, k)) + 2 * Math.min(1, countHits(head, k)) + 2 * Math.min(1, countHits(filename, k));
    if (rule.slug === "laboratorio") score += Math.min(6, labResultCount * 2);
    if (score > 0 && (!best || score > best.score)) best = { rule, score };
  }
  return best;
}

const TITLE_START = /^(analisis|informe|estudio|perfil|hemograma|ecografia|radiografia|rx|tomografia|resonancia|electrocardiograma|ecocardiograma|receta|resultado|rutina|quimica|orina|mamografia|ergometria|holter|densitometria|consulta|laboratorio de|examen|chequeo|control)\b/;

/** Restaura acentos de palabras médicas frecuentes en títulos sin tildes (PDF/OCR). */
const ACCENTS: Record<string, string> = {
  analisis: "análisis", lipidico: "lipídico", quimica: "química", radiografia: "radiografía", ecografia: "ecografía", tomografia: "tomografía",
  torax: "tórax", hematologico: "hematológico", bioquimico: "bioquímico", clinico: "clínico", clinicos: "clínicos", tiroideo: "tiroideo",
  mamografia: "mamografía", ergometria: "ergometría", densitometria: "densitometría", cardiologico: "cardiológico", hepatico: "hepático",
};

export function prettifyTitle(raw: string): string {
  let t = raw.replace(/\s+/g, " ").replace(/[:\-–|]+$/, "").trim();
  const letters = t.replace(/[^\p{L}]/gu, "");
  if (letters && letters === letters.toUpperCase()) t = t.toLowerCase();
  t = t.replace(/\p{L}+/gu, (w) => {
    const lower = w.toLowerCase();
    const fixed = ACCENTS[lower];
    if (!fixed) return w;
    return w[0] === w[0]!.toUpperCase() ? fixed[0]!.toUpperCase() + fixed.slice(1) : fixed;
  });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function detectTitle(lines: string[], institution: string | null): string | null {
  for (const line of lines.slice(0, 12)) {
    const norm = normalizeLabel(line);
    if (!TITLE_START.test(norm) || line.length < 4 || line.length > 80) continue;
    if (institution && line.includes(institution)) continue;
    if (/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(line)) continue;
    return prettifyTitle(line);
  }
  return null;
}

/** "laboratorio_octubre-2026.pdf" → "Laboratorio octubre 2026" */
export function humanizeFilename(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
  if (!base) return "Estudio";
  return prettifyTitle(base).slice(0, 120);
}

export function analyzeMetadata(input: { text: string; filename: string; categories: readonly string[]; labResultCount: number; ocr?: boolean; now?: Date }): DocumentSuggestions {
  const now = input.now ?? new Date();
  const ocr = !!input.ocr;
  const lines = input.text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const head = normalizeLabel(lines.slice(0, 8).join(" "));
  const body = normalizeLabel(input.text);
  const fileLabel = normalizeLabel(input.filename.replace(/\.[a-z0-9]{2,5}$/i, ""));

  const institution = detectInstitution(lines, ocr);
  const professional = detectProfessional(lines, ocr);

  let occurredOn = detectDate(lines, now);
  if (!occurredOn) {
    const fromName = findDates(input.filename.replace(/_/g, "-"), now)[0];
    if (fromName) occurredOn = { value: fromName, confidence: 0.6, source: "filename" };
  }
  if (occurredOn && ocr) occurredOn = { ...occurredOn, confidence: Math.round(occurredOn.confidence * 0.9 * 100) / 100 };

  const cat = detectCategory(head, body, fileLabel, input.labResultCount, input.categories);
  const categorySlug = cat ? { value: cat.rule.slug, confidence: Math.round(Math.min(0.95, 0.5 + cat.score * 0.06) * 100) / 100, source: (body ? "text" : "filename") as SuggestionSource } : null;

  let specialty: Suggestion<string> | null = null;
  const explicit = /(?:servicio|especialidad)\s+de\s+([\p{L} ]{4,40})/iu.exec(input.text);
  if (explicit) specialty = { value: prettifyTitle(explicit[1]!.trim()), confidence: 0.7, source: "text" };
  else if (cat?.rule.specialty && categorySlug && categorySlug.confidence >= 0.6) specialty = { value: cat.rule.specialty, confidence: categorySlug.confidence - 0.1, source: categorySlug.source };

  const fromText = detectTitle(lines, institution?.value ?? null);
  const title: Suggestion<string> | null = fromText
    ? { value: fromText, confidence: ocr ? 0.7 : 0.82, source: "text" }
    : cat && categorySlug && categorySlug.confidence >= 0.6
      ? { value: cat.rule.title, confidence: 0.55, source: categorySlug.source }
      : { value: humanizeFilename(input.filename), confidence: 0.4, source: "filename" };

  return { title, occurredOn, categorySlug, specialty, institution, professional };
}
