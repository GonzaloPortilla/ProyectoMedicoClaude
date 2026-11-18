import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/cookie-names";
import { authorizeFileRequest } from "@/server/files/access";
import { getStorage } from "@/server/storage";

/**
 * Entrega de archivos médicos. No existe ninguna URL pública ni permanente:
 * cada request valida sesión + permiso + enlace temporal firmado antes de leer el storage.
 */
const MESSAGES = {
  401: "No autenticado",
  403: "El enlace venció o no es válido. Volvé a abrir el documento desde la aplicación.",
  404: "No encontrado",
} as const;

function deny(status: 401 | 403 | 404) {
  return new NextResponse(MESSAGES[status], {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" },
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const sp = request.nextUrl.searchParams;
  const result = await authorizeFileRequest(
    request.cookies.get(SESSION_COOKIE)?.value,
    fileId,
    { exp: sp.get("exp"), sig: sp.get("sig"), download: sp.get("download") },
    { ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: request.headers.get("user-agent") },
  );
  if (result.status !== 200) return deny(result.status);
  const { file, disposition } = result;

  let body: Buffer;
  try {
    body = await getStorage().get(file.storageKey);
  } catch (error) {
    console.error("[files] No se pudo leer el archivo", file.id, error instanceof Error ? error.message : "error");
    return deny(404);
  }

  // El nombre original no es confiable: se sanea al subir y se codifica al responder.
  const encodedName = encodeURIComponent(file.originalName);
  const asciiName = file.originalName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(body.length),
      "Content-Disposition": `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      // Datos de salud: nunca en cachés compartidas ni en disco del navegador.
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Download-Options": "noopen",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none'",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
    },
  });
}
