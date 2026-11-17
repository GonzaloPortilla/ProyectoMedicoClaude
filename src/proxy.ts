import { NextResponse, type NextRequest } from "next/server";

/**
 * Chequeo optimista: si no hay cookie de sesión, redirige a /login sin renderizar.
 * NO es la barrera de seguridad: la validación real de la sesión y del rol ocurre en el
 * servidor (layouts, páginas y server actions vía src/server/auth/dal.ts).
 */
const SESSION_COOKIE = "medapp_session";

export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/patient/:path*", "/doctor/:path*", "/admin/:path*"],
};
