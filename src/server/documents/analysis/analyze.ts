import type { ConceptMatchCandidate } from "@/server/documents/analysis/concepts";
import { extractLabResults, type DetectedMeasurement } from "@/server/documents/analysis/lab-results";
import { analyzeMetadata, type DocumentSuggestions } from "@/server/documents/analysis/metadata";

export type DocumentAnalysis = {
  suggestions: DocumentSuggestions;
  measurements: DetectedMeasurement[];
};

/**
 * Análisis completo del texto de un documento: metadatos propuestos + resultados de
 * laboratorio. Puro y determinístico (mismo texto → mismo resultado).
 */
export function analyzeDocumentText<T extends ConceptMatchCandidate>(input: {
  text: string;
  filename: string;
  categories: readonly string[];
  concepts: readonly T[];
  ocr?: boolean;
  now?: Date;
}): DocumentAnalysis {
  const measurements = input.text ? extractLabResults(input.text, input.concepts, { ocr: input.ocr }) : [];
  const suggestions = analyzeMetadata({ text: input.text, filename: input.filename, categories: input.categories, labResultCount: measurements.length, ocr: input.ocr, now: input.now });
  // Sólo los estudios de laboratorio generan mediciones: evita "valores" sueltos de una receta o un informe.
  const isLab = suggestions.categorySlug?.value === "laboratorio";
  return { suggestions, measurements: isLab ? measurements : [] };
}
