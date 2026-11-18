import { ExtractionError, type DocumentExtractionService, type ExtractionInput, type ExtractedText, type OcrProvider, type PdfReader } from "@/server/documents/extraction/types";
import { UnpdfReader } from "@/server/documents/extraction/pdf-unpdf";
import { TesseractOcrProvider } from "@/server/documents/extraction/ocr-tesseract";

/** Un PDF "tiene texto" si trae una cantidad mínima de letras; si no, se trata como escaneado. */
export function hasUsableText(text: string): boolean {
  return (text.match(/\p{L}/gu) ?? []).length >= 40;
}

/**
 * Implementación local: texto embebido del PDF y, si no hay (escaneado) o es una foto, OCR.
 * Recibe sus dependencias por constructor para poder reemplazarlas (o simularlas en tests).
 */
export class LocalDocumentExtractionService implements DocumentExtractionService {
  readonly name = "local";

  constructor(
    private readonly deps: { pdf: PdfReader; ocr: OcrProvider | null; maxOcrPages: number },
  ) {}

  async extract({ bytes, mimeType }: ExtractionInput): Promise<ExtractedText> {
    if (mimeType === "application/pdf") {
      let pageCount: number | null = null;
      try {
        const { text, pageCount: pages } = await this.deps.pdf.readText(bytes);
        pageCount = pages;
        if (hasUsableText(text)) return { text, method: "PDF_TEXT", provider: this.deps.pdf.name, pageCount, ocrConfidence: null };
      } catch {
        throw new ExtractionError("PDF_UNREADABLE");
      }
      // PDF escaneado: se renderizan las primeras páginas y se aplica OCR.
      const images = await this.deps.pdf.renderPages(bytes, this.deps.maxOcrPages).catch(() => {
        throw new ExtractionError("PDF_UNREADABLE");
      });
      return this.ocr(images, pageCount);
    }
    if (mimeType === "image/jpeg" || mimeType === "image/png") return this.ocr([bytes], 1);
    throw new ExtractionError("UNSUPPORTED_TYPE");
  }

  private async ocr(images: Uint8Array[], pageCount: number | null): Promise<ExtractedText> {
    if (!this.deps.ocr) throw new ExtractionError("OCR_DISABLED");
    let result: { text: string; confidence: number | null };
    try {
      result = await this.deps.ocr.recognize(images);
    } catch (error) {
      // Sólo el mensaje técnico: nunca contenido del documento.
      console.error("[documents] OCR falló:", error instanceof Error ? error.message : "error");
      throw new ExtractionError("OCR_FAILED");
    }
    if (!hasUsableText(result.text)) throw new ExtractionError("NO_TEXT");
    return { text: result.text, method: "OCR", provider: this.deps.ocr.name, pageCount, ocrConfidence: result.confidence };
  }
}

/** Servicio deshabilitado: el estudio se guarda igual, sin análisis. */
export class DisabledExtractionService implements DocumentExtractionService {
  readonly name = "disabled";
  async extract(): Promise<ExtractedText> {
    throw new ExtractionError("DISABLED");
  }
}

let instance: DocumentExtractionService | null = null;

/**
 * Proveedor configurado por variables de entorno:
 *  - DOCUMENT_EXTRACTION = "local" (por defecto) | "disabled"
 *  - OCR_PROVIDER        = "tesseract" (por defecto) | "none"
 *  - OCR_MAX_PAGES       = páginas de un PDF escaneado que se procesan (por defecto 3)
 * Para usar un servicio externo, alcanza con otra implementación de DocumentExtractionService.
 */
export function getDocumentExtractionService(): DocumentExtractionService {
  if (instance) return instance;
  if ((process.env.DOCUMENT_EXTRACTION ?? "local") === "disabled") {
    instance = new DisabledExtractionService();
  } else {
    const ocr = (process.env.OCR_PROVIDER ?? "tesseract") === "none" ? null : new TesseractOcrProvider();
    const maxOcrPages = Math.min(10, Math.max(1, Number(process.env.OCR_MAX_PAGES) || 3));
    instance = new LocalDocumentExtractionService({ pdf: new UnpdfReader(), ocr, maxOcrPages });
  }
  return instance;
}
