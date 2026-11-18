import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Clock, History, Inbox, KeyRound, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DoctorIdentity } from "@/features/access/components/doctor-identity";
import { LinkCodeCard } from "@/features/access/components/link-code-card";
import { PermissionChips } from "@/features/access/components/permission-chips";
import { RevokeButton } from "@/features/access/components/revoke-button";
import { ACCESS_LOG_LABELS, formatDateTime, isExpiringSoon, relativeExpiry, summarizePermissions } from "@/features/access/format";
import { getActiveLinkCode } from "@/server/access/codes";
import { listGrantsForPatient, listPendingRequestsForPatient } from "@/server/access/requests";
import { listActiveCategories } from "@/server/medical/records";
import { requirePatient } from "@/server/patient/context";
import { sweepExpiredGrants } from "@/server/access/expiry";

export const metadata: Metadata = { title: "Mis médicos" };

export default async function PatientDoctorsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { patientId } = await requirePatient();
  await sweepExpiredGrants();
  const [linkCode, pending, grants, categories, params] = await Promise.all([
    getActiveLinkCode(patientId),
    listPendingRequestsForPatient(patientId),
    listGrantsForPatient(patientId),
    listActiveCategories(),
    searchParams,
  ]);
  const catNames = new Map(categories.map((c) => [c.slug, c.name]));
  const notice =
    params.approved === "1" ? "Acceso otorgado." : params.revoked === "1" ? "Acceso revocado. El profesional ya no puede ver tu información." : params.rejected === "1" ? "Solicitud rechazada." : null;

  return (
    <>
      <PageHeader title="Mis médicos" description="Vos decidís qué profesional ve tu información, qué parte y por cuánto tiempo." />
      {notice ? (
        <Alert tone="success" className="mb-5">
          {notice}
        </Alert>
      ) : null}

      {pending.length ? (
        <section className="mb-6" aria-labelledby="pending-title">
          <h2 id="pending-title" className="mb-3 flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
            <Inbox className="size-4 text-amber-600" /> Solicitudes pendientes
            <Badge tone="amber">{pending.length}</Badge>
          </h2>
          <ul className="space-y-3">
            {pending.map((r) => (
              <li key={r.id}>
                <Card className="flex flex-col gap-4 border-amber-200/70 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <DoctorIdentity doctor={r.doctor} />
                    <p className="text-sm text-ink-soft">solicita acceso a tu información médica.</p>
                    {r.message ? <p className="rounded-xl bg-canvas/70 px-3 py-2 text-[13px] break-words text-ink-soft">“{r.message}”</p> : null}
                  </div>
                  <Link href={`/patient/doctors/requests/${r.id}`} className={buttonClasses({ className: "shrink-0" })}>
                    Revisar <ChevronRight className="size-4" />
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-labelledby="active-title" className="min-w-0">
          <h2 id="active-title" className="mb-3 flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
            <ShieldCheck className="size-4 text-brand-600" /> Accesos activos
          </h2>
          {grants.active.length === 0 ? (
            <Card>
              <EmptyState
                compact
                icon={ShieldCheck}
                title="No hay médicos con acceso"
                description="Tu información es privada. Para compartirla, generá un código y dáselo a tu médico: vas a poder elegir qué ve y por cuánto tiempo."
              />
            </Card>
          ) : (
            <ul className="space-y-3">
              {grants.active.map((g) => {
                const name = `${g.doctor.firstName} ${g.doctor.lastName}`;
                return (
                  <li key={g.id}>
                    <Card className="p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <DoctorIdentity doctor={g.doctor} />
                        <Badge tone="brand" dot>
                          Acceso activo
                        </Badge>
                      </div>
                      <div className="mt-4 space-y-3">
                        <div>
                          <p className="mb-1.5 text-xs font-medium text-muted">Puede ver</p>
                          <PermissionChips summary={summarizePermissions(g.permissions, catNames)} />
                        </div>
                        <p className={`flex items-center gap-1.5 text-sm ${isExpiringSoon(g.expiresAt) ? "text-amber-700" : "text-ink-soft"}`}>
                          <Clock className="size-3.5" />
                          {g.expiresAt ? `Vence: ${formatDateTime(g.expiresAt)} · ${relativeExpiry(g.expiresAt)}` : "Permanente, hasta que lo revoques"}
                        </p>
                        {g.logs.length ? (
                          <div>
                            <p className="mb-1 text-xs font-medium text-muted">Últimos accesos</p>
                            <ul className="space-y-0.5 text-[13px] text-ink-soft">
                              {g.logs.map((l, i) => (
                                <li key={i}>
                                  {ACCESS_LOG_LABELS[l.action] ?? l.action} · <span className="text-muted tabular-nums">{formatDateTime(l.createdAt)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <p className="text-[13px] text-muted">Todavía no accedió a tu información.</p>
                        )}
                      </div>
                      <div className="mt-4 flex justify-end border-t border-line pt-4">
                        <RevokeButton grantId={g.id} doctorName={name} />
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}

          {grants.past.length ? (
            <details className="group mt-6">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
                <History className="size-4" /> Accesos anteriores ({grants.past.length})
                <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
              </summary>
              <ul className="mt-3 space-y-2">
                {grants.past.map((g) => (
                  <li key={g.id}>
                    <Card className="flex flex-col gap-2 p-4 opacity-80 sm:flex-row sm:items-center sm:justify-between">
                      <DoctorIdentity doctor={g.doctor} />
                      <Badge tone={g.status === "REVOKED" ? "red" : "neutral"}>
                        {g.status === "REVOKED" ? `Revocado ${g.revokedAt ? formatDateTime(g.revokedAt) : ""}` : g.expiresAt && g.expiresAt <= new Date() ? `Venció ${formatDateTime(g.expiresAt)}` : "Inactivo (profesional no verificado)"}
                      </Badge>
                    </Card>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <div className="order-first min-w-0 lg:order-none">
          <Card>
            <CardHeader title="Vincular un médico" description="Código de un solo uso, válido por 60 minutos." action={<KeyRound className="size-4 text-muted" />} />
            <CardBody>
              <LinkCodeCard hasActiveCode={!!linkCode} activeUntil={linkCode?.expiresAt.toISOString() ?? null} />
            </CardBody>
          </Card>
          <p className="mt-3 px-1 text-[13px] text-muted">
            Ningún profesional puede buscarte ni ver tus datos sin tu código y tu autorización.
          </p>
        </div>
      </div>
    </>
  );
}
