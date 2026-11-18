import type { ExtractionMethod } from "@/generated/prisma/enums";

/**
 * Contratos de extracción de texto. La aplicación depende SÓLO de estas interfaces:
 * el proveedor (local, en la nube, otro motor de OCR) se elige en `getDocumentExtractionService`
 * y se puede reemplazar sin tocar el resto del código.
 */

export type ExtractionInput = { bytes: Uint8Array; mimeType: string; filename: string };

export type ExtractedText = {
  text: string;
  method: ExtractionMethod;
  /** Proveedor que produjo el texto, para trazabilidad ("unpdf", "tesseract.js/spa"). */
  provider: string;
  pageCount: number | null;
  /** Confianza media del OCR, 0–100. */
  ocrConfidence: number | null;
};

export interface DocumentExtractionService {
  readonly name: string;
  /** Devuelve el texto del documento. Lanza ExtractionError si no puede leerlo. */
  extract(input: ExtractionInput): Promise<ExtractedText>;
}

/** Proveedor de OCR: recibe imágenes (PNG/JPEG) y devuelve el texto reconocido. */
export interface OcrProvider {
  readonly name: string;
  recognize(images: Uint8Array[]): Promise<{ text: string; confidence: number | null }>;
}

/** Lectura de PDF: texto embebido y render de páginas a imagen (para OCR de escaneados). */
export interface PdfReader {
  readonly name: string;
  readText(bytes: Uint8Array): Promise<{ text: string; pageCount: number }>;
  renderPages(bytes: Uint8Array, maxPages: number): Promise<Uint8Array[]>;
}

/** Errores esperables. `code` se guarda en la base (sin datos del paciente). */
export class ExtractionError extends Error {
  constructor(
    readonly code: "UNSUPPORTED_TYPE" | "NO_TEXT" | "OCR_DISABLED" | "PDF_UNREADABLE" | "OCR_FAILED" | "DISABLED",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ExtractionError";
  }
}
