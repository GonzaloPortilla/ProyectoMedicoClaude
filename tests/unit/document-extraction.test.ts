/**
 * Fase 6 — DocumentExtractionService: elección de método (texto del PDF u OCR) con
 * proveedores reemplazables, y una prueba real de OCR y de lectura de PDF.
 */
import { describe, expect, it, vi } from "vitest";
import { LocalDocumentExtractionService, hasUsableText } from "@/server/documents/extraction/service";
import { ExtractionError, type OcrProvider, type PdfReader } from "@/server/documents/extraction/types";
import { UnpdfReader } from "@/server/documents/extraction/pdf-unpdf";
import { TesseractOcrProvider } from "@/server/documents/extraction/ocr-tesseract";
import { makeLabPhoto, makePdf, makeScannedPdf } from "../../prisma/demo-documents";

const TEXT = "Laboratorio Demo\nGlucemia 92 mg/dL 70 - 100\nColesterol total 183 mg/dL < 200\nHemoglobina 14,8 g/dL";

function fakes(pdfText: string) {
  const pdf: PdfReader = { name: "fake-pdf", readText: vi.fn(async () => ({ text: pdfText, pageCount: 2 })), renderPages: vi.fn(async () => [new Uint8Array([1]), new Uint8Array([2])]) };
  const ocr: OcrProvider = { name: "fake-ocr", recognize: vi.fn(async () => ({ text: TEXT, confidence: 88 })) };
  return { pdf, ocr };
}
const input = (mimeType: string) => ({ bytes: new Uint8Array([0]), mimeType, filename: "x" });

describe("DocumentExtractionService (proveedores simulados)", () => {
  it("PDF con texto: usa el texto embebido y no llama al OCR", async () => {
    const { pdf, ocr } = fakes(TEXT);
    const r = await new LocalDocumentExtractionService({ pdf, ocr, maxOcrPages: 3 }).extract(input("application/pdf"));
    expect(r).toMatchObject({ method: "PDF_TEXT", provider: "fake-pdf", pageCount: 2 });
    expect(ocr.recognize).not.toHaveBeenCalled();
  });

  it("PDF escaneado (sin texto): renderiza las páginas y aplica OCR", async () => {
    const { pdf, ocr } = fakes("   \n ");
    const r = await new LocalDocumentExtractionService({ pdf, ocr, maxOcrPages: 3 }).extract(input("application/pdf"));
    expect(r).toMatchObject({ method: "OCR", provider: "fake-ocr", ocrConfidence: 88, pageCount: 2 });
    expect(pdf.renderPages).toHaveBeenCalledWith(expect.any(Uint8Array), 3);
  });

  it("fotografía: OCR directo", async () => {
    const { pdf, ocr } = fakes("");
    const r = await new LocalDocumentExtractionService({ pdf, ocr, maxOcrPages: 3 }).extract(input("image/jpeg"));
    expect(r.method).toBe("OCR");
    expect(pdf.readText).not.toHaveBeenCalled();
  });

  it("errores esperables con código (sin datos del paciente)", async () => {
    const { pdf } = fakes("");
    const noOcr = new LocalDocumentExtractionService({ pdf, ocr: null, maxOcrPages: 3 });
    await expect(noOcr.extract(input("image/png"))).rejects.toMatchObject({ code: "OCR_DISABLED" });
    await expect(noOcr.extract(input("text/html"))).rejects.toBeInstanceOf(ExtractionError);
    const blank: OcrProvider = { name: "blank", recognize: async () => ({ text: "  ", confidence: 10 }) };
    await expect(new LocalDocumentExtractionService({ pdf, ocr: blank, maxOcrPages: 1 }).extract(input("image/png"))).rejects.toMatchObject({ code: "NO_TEXT" });
  });

  it("umbral de texto utilizable", () => {
    expect(hasUsableText("abc")).toBe(false);
    expect(hasUsableText(TEXT)).toBe(true);
  });
});

describe("proveedores reales (locales, sin red)", () => {
  it("lee el texto de un PDF", async () => {
    const pdf = makePdf("Analisis de sangre", "Fecha de extraccion: 12/10/2026", [["Glucemia", "92 mg/dL", "70 - 100 mg/dL"]], "Demo");
    const r = await new UnpdfReader().readText(new Uint8Array(pdf));
    expect(r.pageCount).toBe(1);
    expect(r.text).toContain("Glucemia 92 mg/dL 70 - 100 mg/dL");
  });

  it("OCR de una foto y de un PDF escaneado", { timeout: 60_000 }, async () => {
    const lines = ["Laboratorio Demo", "Fecha: 12/10/2026", "Glucemia 92 mg/dL 70 - 100", "Colesterol total 183 mg/dL < 200"];
    const photo = await makeLabPhoto(lines, "jpeg");
    const service = new LocalDocumentExtractionService({ pdf: new UnpdfReader(), ocr: new TesseractOcrProvider(), maxOcrPages: 2 });
    const fromPhoto = await service.extract({ bytes: new Uint8Array(photo.body), mimeType: "image/jpeg", filename: "foto.jpg" });
    expect(fromPhoto.method).toBe("OCR");
    expect(fromPhoto.text).toMatch(/Glucemia 92 mg\/dL/);
    const scanned = makeScannedPdf(photo.body, photo.width, photo.height);
    const fromScan = await service.extract({ bytes: new Uint8Array(scanned), mimeType: "application/pdf", filename: "scan.pdf" });
    expect(fromScan.method).toBe("OCR");
    expect(fromScan.text).toMatch(/Colesterol total 183/);
  });
});
