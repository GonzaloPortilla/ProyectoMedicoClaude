/**
 * Fase 6 — Extracción y normalización (lógica pura, sin base de datos).
 */
import { describe, expect, it } from "vitest";
import { parseLocaleNumber } from "@/server/documents/analysis/numbers";
import { CONCEPT_CATALOG, matchConcept, measurementKey, normalizeLabel } from "@/server/documents/analysis/concepts";
import { extractLabResults, outsideReportedRange, parseLabLine } from "@/server/documents/analysis/lab-results";
import { analyzeMetadata, findDates, humanizeFilename } from "@/server/documents/analysis/metadata";
import { analyzeDocumentText } from "@/server/documents/analysis/analyze";

const CATEGORIES = ["laboratorio", "cardiologia", "diagnostico-por-imagenes", "recetas", "otros"];
const NOW = new Date("2026-11-18T12:00:00Z");

const LAB_TEXT = `Laboratorio Demo
Análisis de sangre completo
Fecha de extracción: 12/10/2026   Protocolo N 0000-DEMO
Paciente: Martín Demo - F. Nac: 01/02/1985
Médico solicitante: Dra. Sofía Ramos
Determinación Resultado Valor de referencia
Glucemia ........ 92 mg/dL 70 - 100 mg/dL
Colesterol total 183 mg/dL < 200 mg/dL
HDL 55 mg/dL > 40
LDL 109 mg/dL
Plaquetas 245.000 /mm3 150.000 - 400.000 /mm3`;

describe("números con formato local", () => {
  it.each([
    ["14,8", 14.8],
    ["0.9", 0.9],
    ["6.800", 6800],
    ["245.000", 245000],
    ["1.234,5", 1234.5],
    ["1,234.5", 1234.5],
    ["92", 92],
  ])("%s → %d", (raw, expected) => expect(parseLocaleNumber(raw)).toBe(expected));

  it("rechaza lo que no es un número", () => {
    expect(parseLocaleNumber("abc")).toBeNull();
    expect(parseLocaleNumber("1.2.3,4,5")).toBeNull();
  });
});

describe("líneas de resultados de laboratorio", () => {
  it("valor, unidad y rango", () => {
    expect(parseLabLine("Glucemia 92 mg/dL 70 - 100")).toMatchObject({ originalName: "Glucemia", valueNumeric: 92, unit: "mg/dL", refLow: 70, refHigh: 100 });
  });
  it("con líneas de puntos y dos puntos", () => {
    expect(parseLabLine("Colesterol total: ........ 238 mg/dL")).toMatchObject({ originalName: "Colesterol total", valueNumeric: 238, unit: "mg/dL" });
  });
  it("límite superior e inferior", () => {
    expect(parseLabLine("Colesterol total 183 mg/dL < 200")).toMatchObject({ refLow: null, refHigh: 200 });
    expect(parseLabLine("HDL 55 mg/dL > 40")).toMatchObject({ refLow: 40, refHigh: null });
    expect(parseLabLine("Triglicéridos 120 mg/dL hasta 150")).toMatchObject({ refHigh: 150 });
  });
  it("coma decimal y separador de miles", () => {
    expect(parseLabLine("Hemoglobina 14,8 g/dL 13,5 - 17,5 g/dL")).toMatchObject({ valueNumeric: 14.8, refLow: 13.5, refHigh: 17.5, refText: "13,5 - 17,5 g/dL" });
    expect(parseLabLine("Glóbulos blancos 6.800 /mm3 4.000 - 10.000")).toMatchObject({ valueNumeric: 6800, refLow: 4000, refHigh: 10000 });
  });
  it("nombres con dígitos", () => {
    expect(parseLabLine("T4 libre 1,2 ng/dL 0,8 a 1,8")).toMatchObject({ originalName: "T4 libre", valueNumeric: 1.2 });
    expect(parseLabLine("Vitamina B12 320 pg/mL 200 - 900")).toMatchObject({ originalName: "Vitamina B12", valueNumeric: 320 });
  });
  it("marca de fuera de rango impresa en el documento", () => {
    expect(parseLabLine("LDL 162 mg/dL H < 130")?.documentFlag).toBe("H");
    expect(parseLabLine("Vitamina B12 * 180 pg/mL 200 - 900")?.documentFlag).toBe("*");
  });
  it("unidad después de la referencia", () => {
    expect(parseLabLine("Hemoglobina 14,8 13,5 - 17,5 g/dL")).toMatchObject({ valueNumeric: 14.8, unit: "g/dL", refLow: 13.5 });
  });
  it("valor con calificador: se conserva el texto pero no se grafica", () => {
    expect(parseLabLine("Ferritina <5 ng/mL")).toMatchObject({ valueText: "<5", valueNumeric: null });
  });
  it("ignora datos administrativos", () => {
    expect(parseLabLine("Protocolo N 0000-DEMO")).toBeNull();
    expect(parseLabLine("Paciente: Martín Demo DNI 30.000.000")).toBeNull();
    expect(parseLabLine("Fecha 12/10/2026")).toBeNull();
    expect(parseLabLine("Edad 38 años")).toBeNull();
  });
});

describe("extracción de resultados", () => {
  const results = extractLabResults(LAB_TEXT, CONCEPT_CATALOG);
  it("encuentra todos los parámetros y conserva el nombre original", () => {
    expect(results.map((r) => r.originalName)).toEqual(["Glucemia", "Colesterol total", "HDL", "LDL", "Plaquetas"]);
    expect(results.map((r) => r.conceptCode)).toEqual(["glucose", "cholesterol_total", "cholesterol_hdl", "cholesterol_ldl", "platelets"]);
  });
  it("la confianza refleja lo que se pudo leer", () => {
    const glucose = results.find((r) => r.conceptCode === "glucose")!;
    const ldl = results.find((r) => r.conceptCode === "cholesterol_ldl")!;
    expect(glucose.confidence).toBeGreaterThan(ldl.confidence); // LDL no tiene referencia
    expect(extractLabResults(LAB_TEXT, CONCEPT_CATALOG, { ocr: true })[0]!.confidence).toBeLessThan(glucose.confidence);
  });
  it("acepta parámetros desconocidos sólo si tienen unidad", () => {
    const r = extractLabResults("Magnesio 2,1 mg/dL 1,6 - 2,6\nCosa rara 12", CONCEPT_CATALOG);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ originalName: "Magnesio", conceptCode: null, normalizedKey: "raw:magnesio" });
  });
  it("no duplica un parámetro repetido en el documento", () => {
    expect(extractLabResults("Glucemia 92 mg/dL\nGlucosa 95 mg/dL", CONCEPT_CATALOG)).toHaveLength(1);
  });
});

describe("normalización de conceptos", () => {
  it.each(["Glucemia", "Glucosa", "Glucose", "GLUCEMIA EN AYUNAS", "Glucemia (en ayunas)", "glucosa basal"])("%s → glucose", (name) => {
    expect(matchConcept(name, CONCEPT_CATALOG)?.code).toBe("glucose");
  });
  it("gana el sinónimo más específico", () => {
    expect(matchConcept("Colesterol HDL", CONCEPT_CATALOG)?.code).toBe("cholesterol_hdl");
    expect(matchConcept("Colesterol LDL", CONCEPT_CATALOG)?.code).toBe("cholesterol_ldl");
    expect(matchConcept("Colesterol total", CONCEPT_CATALOG)?.code).toBe("cholesterol_total");
    expect(matchConcept("Hemoglobina glicosilada", CONCEPT_CATALOG)?.code).toBe("hba1c");
    expect(matchConcept("Hemoglobina", CONCEPT_CATALOG)?.code).toBe("hemoglobin");
  });
  it("los sinónimos cortos sólo valen como nombre completo", () => {
    expect(matchConcept("K", CONCEPT_CATALOG)?.code).toBe("potassium");
    expect(matchConcept("Na", CONCEPT_CATALOG)?.code).toBe("sodium");
    expect(matchConcept("Vitamina K", CONCEPT_CATALOG)).toBeNull();
  });
  it("conserva el nombre original y arma la clave de agrupación", () => {
    expect(normalizeLabel("Glucemia  (en ayunas)!")).toBe("glucemia en ayunas");
    expect(measurementKey("Glucosa", "glucose")).toBe("glucose");
    expect(measurementKey("Magnesio sérico", null)).toBe("raw:magnesio serico");
  });
  it("el catálogo no tiene códigos ni sinónimos repetidos entre conceptos", () => {
    const codes = CONCEPT_CATALOG.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    const owner = new Map<string, string>();
    for (const c of CONCEPT_CATALOG) {
      for (const a of c.aliases.map(normalizeLabel)) {
        expect(owner.get(a) ?? c.code, `sinónimo "${a}" repetido`).toBe(c.code);
        owner.set(a, c.code);
      }
    }
  });
});

describe("metadatos propuestos", () => {
  const s = analyzeMetadata({ text: LAB_TEXT, filename: "laboratorio_octubre.pdf", categories: CATEGORIES, labResultCount: 5, now: NOW });
  it("título, fecha, tipo, institución y profesional", () => {
    expect(s.title?.value).toBe("Análisis de sangre completo");
    expect(s.occurredOn?.value).toBe("2026-10-12");
    expect(s.categorySlug?.value).toBe("laboratorio");
    expect(s.institution?.value).toBe("Laboratorio Demo");
    expect(s.professional?.value).toBe("Dra. Sofía Ramos");
  });
  it("nunca propone la fecha de nacimiento", () => {
    const r = analyzeMetadata({ text: "Paciente: X\nFecha de nacimiento: 01/02/1985", filename: "a.pdf", categories: CATEGORIES, labResultCount: 0, now: NOW });
    expect(r.occurredOn).toBeNull();
  });
  it("descarta fechas futuras y entiende meses escritos", () => {
    expect(findDates("Fecha: 12/10/2030", NOW)).toEqual([]);
    expect(findDates("Realizado el 3 de marzo de 2025", NOW)).toEqual(["2025-03-03"]);
    expect(findDates("2026-10-12", NOW)).toEqual(["2026-10-12"]);
  });
  it("usa el nombre del archivo cuando no hay texto", () => {
    const r = analyzeMetadata({ text: "", filename: "ecografia_2025-03-14.jpg", categories: CATEGORIES, labResultCount: 0, now: NOW });
    expect(r.occurredOn).toMatchObject({ value: "2025-03-14", source: "filename" });
    expect(r.categorySlug?.value).toBe("diagnostico-por-imagenes");
    expect(humanizeFilename("laboratorio_octubre.pdf")).toBe("Laboratorio octubre");
  });
  it("detecta otros tipos de estudio", () => {
    const ecg = analyzeMetadata({ text: "Hospital Demo\nElectrocardiograma\nRitmo sinusal", filename: "x.pdf", categories: CATEGORIES, labResultCount: 0, now: NOW });
    expect(ecg.categorySlug?.value).toBe("cardiologia");
    expect(ecg.specialty?.value).toBe("Cardiología");
  });
});

describe("análisis completo", () => {
  it("sólo los estudios de laboratorio generan mediciones", () => {
    const receta = analyzeDocumentText({ text: "Receta\nRp/ Enalapril 10 mg\nComprimidos 30 mg", filename: "receta.pdf", categories: CATEGORIES, concepts: CONCEPT_CATALOG, now: NOW });
    expect(receta.suggestions.categorySlug?.value).toBe("recetas");
    expect(receta.measurements).toEqual([]);
    expect(analyzeDocumentText({ text: LAB_TEXT, filename: "a.pdf", categories: CATEGORIES, concepts: CONCEPT_CATALOG, now: NOW }).measurements).toHaveLength(5);
  });
});

describe("rango informado por el laboratorio (sin interpretación)", () => {
  it("compara sólo contra la referencia impresa", () => {
    expect(outsideReportedRange(101, 70, 100)).toBe(true);
    expect(outsideReportedRange(92, 70, 100)).toBe(false);
    expect(outsideReportedRange(238, null, 200)).toBe(true);
    expect(outsideReportedRange(35, 40, null)).toBe(true);
    expect(outsideReportedRange(null, 70, 100)).toBe(false);
    expect(outsideReportedRange(92, null, null)).toBe(false);
  });
});
