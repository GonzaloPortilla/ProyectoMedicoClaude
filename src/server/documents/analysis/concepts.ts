/**
 * Normalización de nombres de parámetros de laboratorio.
 *
 * "Glucemia", "Glucosa en ayunas" y "Glucose" representan el mismo indicador. Se conserva
 * SIEMPRE el nombre original del documento y, aparte, se asigna un concepto normalizado.
 *
 * El catálogo inicial se inserta en la base con la migración `document_processing` y luego
 * se lee de la tabla `measurement_concepts` (extensible sin tocar código). Los códigos
 * LOINC / SNOMED CT quedan vacíos hasta validarlos con un terminólogo.
 *
 * Este módulo es puro (sin base ni red) para poder testearlo y reutilizarlo en el seed.
 */

export type ConceptDefinition = {
  code: string;
  displayName: string;
  /** Sinónimos; se normalizan al comparar. */
  aliases: string[];
  defaultUnit?: string;
};

export const CONCEPT_CATALOG: ConceptDefinition[] = [
  { code: "glucose", displayName: "Glucemia", aliases: ["glucemia", "glucosa", "glucose", "glicemia", "glucemia en ayunas", "glucosa en ayunas", "glucosa basal", "glucemia basal", "fasting glucose"], defaultUnit: "mg/dL" },
  { code: "hba1c", displayName: "Hemoglobina glicosilada (HbA1c)", aliases: ["hba1c", "hemoglobina glicosilada", "hemoglobina glicada", "hemoglobina a1c", "a1c", "glycated hemoglobin"], defaultUnit: "%" },
  { code: "cholesterol_total", displayName: "Colesterol total", aliases: ["colesterol total", "colesterol", "colesterolemia", "cholesterol", "total cholesterol"], defaultUnit: "mg/dL" },
  { code: "cholesterol_hdl", displayName: "Colesterol HDL", aliases: ["hdl", "colesterol hdl", "hdl colesterol", "c hdl", "hdl c", "hdl cholesterol"], defaultUnit: "mg/dL" },
  { code: "cholesterol_ldl", displayName: "Colesterol LDL", aliases: ["ldl", "colesterol ldl", "ldl colesterol", "c ldl", "ldl c", "ldl cholesterol"], defaultUnit: "mg/dL" },
  { code: "triglycerides", displayName: "Triglicéridos", aliases: ["trigliceridos", "trigliceridemia", "triglycerides", "tg"], defaultUnit: "mg/dL" },
  { code: "hemoglobin", displayName: "Hemoglobina", aliases: ["hemoglobina", "hemoglobin", "hb", "hgb"], defaultUnit: "g/dL" },
  { code: "hematocrit", displayName: "Hematocrito", aliases: ["hematocrito", "hematocrit", "hto", "hct"], defaultUnit: "%" },
  { code: "rbc", displayName: "Glóbulos rojos", aliases: ["globulos rojos", "hematies", "eritrocitos", "recuento de globulos rojos", "red blood cells", "rbc"] },
  { code: "wbc", displayName: "Glóbulos blancos", aliases: ["globulos blancos", "leucocitos", "recuento de globulos blancos", "recuento de leucocitos", "white blood cells", "wbc"] },
  { code: "platelets", displayName: "Plaquetas", aliases: ["plaquetas", "recuento de plaquetas", "platelets", "plt"] },
  { code: "creatinine", displayName: "Creatinina", aliases: ["creatinina", "creatininemia", "creatinina serica", "creatinine"], defaultUnit: "mg/dL" },
  { code: "urea", displayName: "Urea", aliases: ["urea", "uremia", "urea serica"], defaultUnit: "mg/dL" },
  { code: "uric_acid", displayName: "Ácido úrico", aliases: ["acido urico", "uricemia", "uric acid"], defaultUnit: "mg/dL" },
  { code: "tsh", displayName: "TSH", aliases: ["tsh", "tirotrofina", "hormona tiroestimulante", "tsh ultrasensible"] },
  { code: "t4_free", displayName: "T4 libre", aliases: ["t4 libre", "t4l", "free t4", "tiroxina libre", "ft4"] },
  { code: "ast", displayName: "GOT / AST", aliases: ["got", "ast", "tgo", "got ast", "aspartato aminotransferasa", "transaminasa oxalacetica"], defaultUnit: "U/L" },
  { code: "alt", displayName: "GPT / ALT", aliases: ["gpt", "alt", "tgp", "gpt alt", "alanina aminotransferasa", "transaminasa piruvica"], defaultUnit: "U/L" },
  { code: "gamma_gt", displayName: "Gamma GT", aliases: ["gamma gt", "ggt", "gamma glutamil transferasa", "gamma glutamiltranspeptidasa"], defaultUnit: "U/L" },
  { code: "alp", displayName: "Fosfatasa alcalina", aliases: ["fosfatasa alcalina", "fal", "alp", "alkaline phosphatase"], defaultUnit: "U/L" },
  { code: "bilirubin_total", displayName: "Bilirrubina total", aliases: ["bilirrubina total", "bilirrubina", "total bilirubin"], defaultUnit: "mg/dL" },
  { code: "sodium", displayName: "Sodio", aliases: ["sodio", "natremia", "sodium", "na"], defaultUnit: "mEq/L" },
  { code: "potassium", displayName: "Potasio", aliases: ["potasio", "kalemia", "potassium", "k"], defaultUnit: "mEq/L" },
  { code: "iron", displayName: "Hierro", aliases: ["hierro", "hierro serico", "ferremia", "sideremia", "iron"] },
  { code: "ferritin", displayName: "Ferritina", aliases: ["ferritina", "ferritin"], defaultUnit: "ng/mL" },
  { code: "vitamin_d", displayName: "Vitamina D (25-OH)", aliases: ["vitamina d", "25 oh vitamina d", "vitamina d 25 oh", "25 hidroxivitamina d", "vitamin d"], defaultUnit: "ng/mL" },
  { code: "vitamin_b12", displayName: "Vitamina B12", aliases: ["vitamina b12", "b12", "cianocobalamina", "vitamin b12"], defaultUnit: "pg/mL" },
  { code: "psa", displayName: "PSA total", aliases: ["psa", "psa total", "antigeno prostatico especifico"], defaultUnit: "ng/mL" },
  { code: "crp", displayName: "Proteína C reactiva", aliases: ["proteina c reactiva", "pcr", "crp", "pcr ultrasensible"], defaultUnit: "mg/L" },
  { code: "esr", displayName: "Eritrosedimentación", aliases: ["eritrosedimentacion", "vsg", "eritro", "velocidad de sedimentacion", "esr"], defaultUnit: "mm/h" },
];

/** Minúsculas, sin acentos, sin puntuación y con espacios simples. */
export function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ConceptMatchCandidate = { id?: string; code: string; displayName: string; aliases: string[] };

/**
 * Busca el concepto de un nombre original. Gana el sinónimo más largo que aparezca como
 * palabras completas ("Colesterol HDL" → HDL, no "colesterol"). Los sinónimos de hasta 3
 * letras ("na", "k", "hb") sólo valen si son el nombre completo, para evitar falsos positivos.
 */
export function matchConcept<T extends ConceptMatchCandidate>(originalName: string, concepts: readonly T[]): T | null {
  const label = normalizeLabel(originalName.replace(/\([^)]*\)/g, " "));
  if (!label) return null;
  const padded = ` ${label} `;
  let best: { concept: T; length: number } | null = null;
  for (const concept of concepts) {
    for (const rawAlias of concept.aliases) {
      const alias = normalizeLabel(rawAlias);
      if (!alias) continue;
      const hit = alias.length <= 3 ? label === alias : padded.includes(` ${alias} `);
      if (hit && (!best || alias.length > best.length)) best = { concept, length: alias.length };
    }
  }
  return best?.concept ?? null;
}

/** Clave de agrupación de una medición: el concepto si se reconoce; si no, el nombre normalizado. */
export function measurementKey(originalName: string, conceptCode: string | null | undefined): string {
  return conceptCode ? conceptCode : `raw:${normalizeLabel(originalName).slice(0, 80)}`;
}
