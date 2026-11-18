import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/cookie-names";
import { validateSessionToken } from "@/server/auth/session";
import { buildPersonalDataExport } from "@/server/privacy/export";
import { actorTypeFor, audit } from "@/server/audit/log";
import { limiters } from "@/server/auth/rate-limit";
import { db } from "@/server/db";

/**
 * Descarga de los datos personales del usuario autenticado.
 * Sólo POST desde el mismo origen (protección CSRF) y con límite de frecuencia.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return new NextResponse("Origen no permitido", { status: 403 });

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await validateSessionToken(token) : null;
  if (!session) return new NextResponse("No autenticado", { status: 401 });
  if (!limiters.sensitive.consume(`export:${session.user.id}`).allowed) return new NextResponse("Demasiadas exportaciones seguidas. Probá en unos minutos.", { status: 429 });

  const data = await buildPersonalDataExport(session.user.id);
  const subject = session.user.roles.includes("PATIENT") ? (await db.patientProfile.findUnique({ where: { userId: session.user.id }, select: { id: true } }))?.id : null;
  await audit(
    { action: "DATA_EXPORTED", actorType: actorTypeFor(session.user.roles), actorUserId: session.user.id, subjectPatientId: subject ?? null, resourceType: "USER", resourceId: session.user.id },
    { ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: request.headers.get("user-agent") },
  );

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="mis-datos-vitalia-${date}.json"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
