import type { PdfReader } from "@/server/documents/extraction/types";

/** Lector de PDF basado en pdf.js (paquete `unpdf`). Se ejecuta localmente, sin red. */
export class UnpdfReader implements PdfReader {
  readonly name = "unpdf";

  async readText(bytes: Uint8Array) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    // pdf.js puede transferir el buffer: se trabaja sobre una copia para no tocar el original.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    try {
      const { text, totalPages } = await extractText(pdf, { mergePages: false });
      return { text: (text as string[]).join("\n\f\n"), pageCount: totalPages };
    } finally {
      await pdf.cleanup?.();
    }
  }

  async renderPages(bytes: Uint8Array, maxPages: number) {
    const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const pages = Math.min(pdf.numPages, maxPages);
    await pdf.cleanup?.();
    const images: Uint8Array[] = [];
    for (let page = 1; page <= pages; page++) {
      const png = await renderPageAsImage(new Uint8Array(bytes), page, { canvasImport: () => import("@napi-rs/canvas"), scale: 2 });
      images.push(new Uint8Array(png));
    }
    return images;
  }
}
