import "server-only";
import { hmac, safeEqual } from "@/server/crypto/keys";

/**
 * URLs temporales de archivos.
 *
 * Además de la sesión (que se valida igual en cada request), cada enlace lleva una firma
 * HMAC atada a: usuario + archivo + modo (ver/descargar) + vencimiento. Un enlace copiado
 * no sirve a otra persona ni después de vencer, y no existe ninguna URL permanente.
 */
export const FILE_URL_TTL_MS = 10 * 60 * 1000; // 10 minutos

export type FileDisposition = "inline" | "attachment";

function payload(userId: string, fileId: string, disposition: FileDisposition, exp: number) {
  return `${userId}|${fileId}|${disposition}|${exp}`;
}

export function signedFileUrl(userId: string, fileId: string, disposition: FileDisposition = "inline", now = Date.now()): string {
  const exp = now + FILE_URL_TTL_MS;
  const sig = hmac("file-url", payload(userId, fileId, disposition, exp));
  const params = new URLSearchParams({ exp: String(exp), sig });
  if (disposition === "attachment") params.set("download", "1");
  return `/api/files/${encodeURIComponent(fileId)}?${params.toString()}`;
}

export type SignatureCheck = { ok: true; disposition: FileDisposition } | { ok: false; reason: "missing" | "invalid" | "expired" };

export function verifyFileSignature(
  userId: string,
  fileId: string,
  params: { exp?: string | null; sig?: string | null; download?: string | null },
  now = Date.now(),
): SignatureCheck {
  const { exp, sig } = params;
  if (!exp || !sig) return { ok: false, reason: "missing" };
  if (!/^\d{1,16}$/.test(exp) || sig.length > 100) return { ok: false, reason: "invalid" };
  const disposition: FileDisposition = params.download === "1" ? "attachment" : "inline";
  if (!safeEqual(sig, hmac("file-url", payload(userId, fileId, disposition, Number(exp))))) return { ok: false, reason: "invalid" };
  if (Number(exp) < now) return { ok: false, reason: "expired" };
  return { ok: true, disposition };
}
