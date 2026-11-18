import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/cookie-names";

/**
 * Proxy (se ejecuta antes de cada página):
 *
 * 1. Content Security Policy con un nonce aleatorio por request: el navegador sólo ejecuta
 *    scripts de Next marcados con ese nonce, así un script inyectado (XSS) no corre.
 * 2. Chequeo optimista de sesión en rutas privadas: sin cookie, redirige a /login sin
 *    renderizar. NO es la barrera de seguridad: la validación real ocurre en el servidor
 *    (layouts, páginas, server actions y route handlers vía src/server/auth/dal.ts).
 */
const PROTECTED = ["/dashboard", "/patient", "/doctor", "/admin", "/settings"];

function buildCsp(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Los estilos inline (atributos style de React) no ejecutan código.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Todas las páginas, salvo assets estáticos, imágenes optimizadas y archivos de la API
    // (la API define su propia CSP restrictiva por respuesta).
    { source: "/((?!api/|_next/static|_next/image|favicon.ico|icon.svg).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] },
  ],
};
