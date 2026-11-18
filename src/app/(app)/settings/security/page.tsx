import type { Metadata } from "next";
import { LogOut, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { DisableMfaForm } from "@/features/settings/components/disable-mfa-form";
import { MfaSetup } from "@/features/settings/components/mfa-setup";
import { PasswordForm } from "@/features/settings/components/password-form";
import { revokeOtherSessionsAction, revokeSessionAction } from "@/features/settings/actions";
import { formatDateTime } from "@/features/access/format";
import { getCurrentSession } from "@/server/auth/dal";
import { mfaRequiredFor, remainingRecoveryCodes } from "@/server/auth/mfa";
import { listUserSessions, sessionPolicy } from "@/server/auth/session";
import { describeUserAgent } from "@/server/audit/net";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Seguridad" };

const fmtHours = (ms: number) => {
  const h = ms / 3600000;
  return h >= 48 ? `${h / 24} días` : `${h} h`;
};

export default async function SettingsSecurityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const { user } = session;
  const [sessions, recovery, sp] = await Promise.all([listUserSessions(user.id), user.mfaEnabled ? remainingRecoveryCodes(user.id) : 0, searchParams]);
  const required = mfaRequiredFor(user.roles);
  const policy = sessionPolicy(user.roles);

  return (
    <div className="space-y-5">
      {sp.mfa === "required" && !user.mfaEnabled ? (
        <Alert tone="info">Tu rol requiere verificación en dos pasos. Configurala para continuar.</Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Verificación en dos pasos"
          description="Además de tu contraseña, se te pedirá un código de tu teléfono al ingresar."
          action={user.mfaEnabled ? <Badge tone="brand" dot>Activada</Badge> : <Badge>Desactivada</Badge>}
        />
        <CardBody>
          {user.mfaEnabled ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-sm text-ink-soft">
                <ShieldCheck className="size-4 text-brand-600" /> Te quedan {recovery} códigos de recuperación sin usar.
              </p>
              {required ? <p className="text-[13px] text-muted">Obligatoria para tu rol.</p> : <DisableMfaForm />}
            </div>
          ) : (
            <MfaSetup />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Contraseña" />
        <CardBody>
          <PasswordForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Sesiones activas"
          description={`Por seguridad, las sesiones se cierran tras ${fmtHours(policy.idleMs)} sin actividad y, como máximo, a los ${fmtHours(policy.absoluteMs)}.`}
        />
        <CardBody>
          <ul className="divide-y divide-line">
            {sessions.map((s) => {
              const current = s.publicId === session.sessionPublicId;
              return (
                <li key={s.publicId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <MonitorSmartphone className="size-5 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                      {describeUserAgent(s.userAgent)} {current ? <Badge tone="brand">Esta sesión</Badge> : null}
                    </p>
                    <p className="text-[13px] text-muted">
                      {s.ipAddress ? `IP ${s.ipAddress.replace(/\.0$/, ".x")} · ` : ""}Última actividad {formatDateTime(s.lastSeenAt)} · Inicio {formatDateTime(s.createdAt)}
                    </p>
                  </div>
                  {current ? null : (
                    <form action={revokeSessionAction}>
                      <input type="hidden" name="publicId" value={s.publicId} />
                      <SubmitButton variant="secondary" size="sm" pendingLabel="Cerrando…">
                        Cerrar
                      </SubmitButton>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
          {sessions.length > 1 ? (
            <form action={revokeOtherSessionsAction} className="mt-4 border-t border-line pt-4">
              <SubmitButton variant="danger" size="sm" pendingLabel="Cerrando…">
                <LogOut className="size-3.5" /> Cerrar todas las demás sesiones
              </SubmitButton>
            </form>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
