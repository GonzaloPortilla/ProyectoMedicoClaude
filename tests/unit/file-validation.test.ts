import { describe, expect, it } from "vitest";
import { detectMime, sanitizeFileName, validateUpload, MAX_FILE_BYTES } from "@/server/files/validation";
import { LocalStorageDriver } from "@/server/storage/local";
import { normalizeText, parseDateOnly, parseTags } from "@/lib/text";
import { HTML_BYTES, JPEG_BYTES, PDF_BYTES, PNG_BYTES } from "../helpers/fixtures";

describe("detección de tipo de archivo por contenido", () => {
  it("reconoce PDF, JPEG y PNG por su firma", () => {
    expect(detectMime(PDF_BYTES)).toBe("application/pdf");
    expect(detectMime(JPEG_BYTES)).toBe("image/jpeg");
    expect(detectMime(PNG_BYTES)).toBe("image/png");
  });

  it("rechaza contenido no permitido aunque tenga extensión .pdf", () => {
    expect(validateUpload("malicioso.pdf", HTML_BYTES.length, HTML_BYTES)).toMatchObject({ ok: false });
  });

  it("rechaza extensión que no coincide con el contenido", () => {
    expect(validateUpload("foto.png", PDF_BYTES.length, PDF_BYTES)).toMatchObject({ ok: false });
  });

  it("acepta .jpg y .jpeg para JPEG", () => {
    expect(validateUpload("a.jpg", 10, JPEG_BYTES).ok).toBe(true);
    expect(validateUpload("a.JPEG", 10, JPEG_BYTES).ok).toBe(true);
  });

  it("rechaza archivos vacíos o de más de 15 MB", () => {
    expect(validateUpload("a.pdf", 0, PDF_BYTES).ok).toBe(false);
    expect(validateUpload("a.pdf", MAX_FILE_BYTES + 1, PDF_BYTES).ok).toBe(false);
  });

  it("limpia nombres de archivo peligrosos", () => {
    expect(sanitizeFileName('../../etc/"passwd".pdf')).toBe("passwd.pdf");
    expect(sanitizeFileName("C:\\fakepath\\informe<1>.pdf")).toBe("informe1.pdf");
  });
});

describe("storage local", () => {
  it("bloquea path traversal en las claves", async () => {
    const driver = new LocalStorageDriver(process.env.LOCAL_STORAGE_DIR!);
    await expect(driver.get("../../etc/passwd")).rejects.toThrow();
    await expect(driver.put("../fuera", Buffer.from("x"), "text/plain")).rejects.toThrow();
  });
});

describe("utilidades de texto", () => {
  it("normaliza sin acentos ni mayúsculas", () => {
    expect(normalizeText("  Cardiología   PEDIÁTRICA ")).toBe("cardiologia pediatrica");
  });
  it("parsea tags deduplicados", () => {
    expect(parseTags("Control,  control , Sangre,,")).toEqual(["control", "sangre"]);
  });
  it("valida fechas YYYY-MM-DD reales", () => {
    expect(parseDateOnly("2026-02-30")).toBeNull();
    expect(parseDateOnly("2026-02-28")?.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });
});
