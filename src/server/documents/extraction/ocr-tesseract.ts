import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import type { OcrProvider } from "@/server/documents/extraction/types";

/**
 * OCR local con Tesseract (WebAssembly). El modelo de idioma español viene en un paquete
 * npm (`@tesseract.js-data/spa`): no se descarga nada en tiempo de ejecución y ningún
 * documento sale del servidor.
 */
export class TesseractOcrProvider implements OcrProvider {
  readonly name = "tesseract.js/spa";

  async recognize(images: Uint8Array[]) {
    const { createWorker } = await import("tesseract.js");
    const langPath = resolveLangPath();
    const worker = await createWorker("spa", 1, { langPath, gzip: true, cacheMethod: "none", cachePath: tmpdir() });
    try {
      const texts: string[] = [];
      const confidences: number[] = [];
      for (const image of images) {
        const { data } = await worker.recognize(Buffer.from(image));
        texts.push(data.text);
        if (Number.isFinite(data.confidence)) confidences.push(data.confidence);
      }
      const confidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;
      return { text: texts.join("\n\f\n"), confidence };
    } finally {
      await worker.terminate().catch(() => {});
    }
  }
}

/**
 * Carpeta del modelo de idioma. Dentro del bundle de Next `import.meta.url` no apunta a
 * node_modules, así que se prueba también desde el directorio del proyecto.
 */
function resolveLangPath(): string {
  const candidates: string[] = [];
  if (process.env.OCR_LANG_PATH) candidates.push(process.env.OCR_LANG_PATH);
  try {
    const require = createRequire(import.meta.url);
    candidates.push(path.join(path.dirname(require.resolve("@tesseract.js-data/spa/package.json")), "4.0.0_best_int"));
  } catch {
    // seguimos con la ruta del proyecto
  }
  candidates.push(path.join(process.cwd(), "node_modules", "@tesseract.js-data", "spa", "4.0.0_best_int"));
  const found = candidates.find((dir) => existsSync(path.join(dir, "spa.traineddata.gz")));
  if (!found) throw new Error("No se encontró el modelo de idioma del OCR (@tesseract.js-data/spa)");
  return found;
}
