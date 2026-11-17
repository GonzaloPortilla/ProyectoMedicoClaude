import "server-only";

export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

export type AllowedMime = "application/pdf" | "image/jpeg" | "image/png";

const EXTENSIONS: Record<AllowedMime, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
};

/**
 * Detecta el tipo real por la firma de bytes ("magic numbers").
 * No se confía en el MIME ni en la extensión que envía el navegador.
 */
export function detectMime(bytes: Uint8Array): AllowedMime | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return "application/pdf"; // %PDF-
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  return null;
}

export type FileCheck = { ok: true; mime: AllowedMime; safeName: string } | { ok: false; error: string };

export function validateUpload(name: string, size: number, bytes: Uint8Array): FileCheck {
  if (size === 0) return { ok: false, error: "El archivo está vacío." };
  if (size > MAX_FILE_BYTES) return { ok: false, error: "El archivo supera el máximo de 15 MB." };
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mime = detectMime(bytes);
  if (!mime) return { ok: false, error: "Formato no permitido. Subí un PDF, JPG o PNG." };
  if (!EXTENSIONS[mime].includes(ext)) return { ok: false, error: "La extensión del archivo no coincide con su contenido." };
  return { ok: true, mime, safeName: sanitizeFileName(name) };
}

/** Nombre apto para mostrar y para Content-Disposition. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "archivo";
  const cleaned = base.normalize("NFC").replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "").trim().slice(0, 150);
  return cleaned || "archivo";
}
