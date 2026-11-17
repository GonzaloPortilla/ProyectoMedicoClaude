import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/cookies";
import { authorizeFileRequest } from "@/server/files/access";
import { getStorage } from "@/server/storage";

/**
 * Entrega de archivos médicos. No existe ninguna URL pública ni permanente a los bytes:
 * cada request valida sesión + rol + propiedad antes de leer el storage.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const { status, file } = await authorizeFileRequest(token, fileId);

  if (!file) {
    return new NextResponse(status === 401 ? "No autenticado" : "No encontrado", {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let body: Buffer;
  try {
    body = await getStorage().get(file.storageKey);
  } catch (error) {
    console.error("[files] No se pudo leer el archivo", file.id, error);
    return new NextResponse("No encontrado", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const download = request.nextUrl.searchParams.get("download") === "1";
  const encodedName = encodeURIComponent(file.originalName);
  const asciiName = file.originalName.replace(/[^\x20-\x7e]/g, "_");

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(body.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      // Datos de salud: nunca en cachés compartidas ni en disco del navegador.
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
    },
  });
}
