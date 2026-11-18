import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, BadgeCheck, ChevronRight, CircleX, Clock, Hourglass, Inbox, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { VerificationBadge } from "@/components/status/verification-badge";
import { Avatar } from "@/components/shell/user-card";
import { PermissionChips } from "@/features/access/components/permission-chips";
import { formatDateTime, isExpiringSoon, relativeExpiry, summarizePermissions } from "@/features/access/format";
import { CancelRequestButton } from "@/features/doctor/components/cancel-request-button";
import { RequestAccessForm } from "@/features/doctor/components/request-access-form";
import { getOwnDoctorProfile } from "@/features/doctor/queries";
import { listActiveGrantsForDoctor, listPendingRequestsForDoctor } from "@/server/access/requests";
import { listActiveCategories } from "@/server/medical/records";
import { jurisdictionName } from "@/lib/jurisdictions";
import { formatDate, fullName, greeting } from "@/lib/utils";
import { requireRole } from "@/server/auth/dal";
import { sweepExpiredGrants } from "@/server/access/expiry";

export const metadata: Metadata = { title: "Panel profesional" };

const STATUS_COPY = {
  PENDING: {
    Icon: Hourglass,
    ring: "bg-amber-50 text-amber-600 ring-amber-100",
    title: "Tu matrícula está en revisión",
    text: "Estamos verificando tus datos profesionales. Cuando tu cuenta esté verificada vas a poder solicitar acceso a pacientes.",
  },
  VERIFIED: {
    Icon: BadgeCheck,
    ring: "bg-brand-50 text-brand-600 ring-brand-100",
    title: "Cuenta profesional verificada",
    text: "Pedile a tu paciente su código de vinculación para solicitar acceso. Sólo vas a ver lo que él autorice, durante el tiempo que elija.",
  },
  REJECTED: {
    Icon: CircleX,
    ring: "bg-red-50 text-red-600 ring-red-100",
    title: "No pudimos verificar tu matrícula",
    text: "Revisá el motivo indicado abajo. Si creés que se trata de un error, comunicate con soporte.",
  },
} as const;

export default async function DoctorDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("DOCTOR");
  const [profile, { welcome }] = await Promise.all([getOwnDoctorProfile(user.id), searchParams]);

  if (!profile) {
    return (
      <>
        <PageHeader title={`${greeting()}, ${user.firstName}`} />
        <Alert tone="error">No encontramos tu perfil profesional. Contactá a soporte.</Alert>
      </>
    );
  }

  const verified = profile.verificationStatus === "VERIFIED";
  if (verified) await sweepExpiredGrants();
  const [grants, pending, categories] = verified
    ? await Promise.all([listActiveGrantsForDoctor(user.id), listPendingRequestsForDoctor(user.id), listActiveCategories()])
    : [[], [], []];
  const catNames = new Map(categories.map((c) => [c.slug, c.name]));
  const expiring = grants.filter((g) => isExpiringSoon(g.expiresAt));
  const status = STATUS_COPY[profile.verificationStatus];
  const lastEvent = profile.verifications[0];

  return (
    <>
      <PageHeader eyebrow="Panel profesional" title={`${greeting()}, Dr/a. ${user.lastName}`} description="Tus pacientes autorizados y tus solicitudes de acceso." />

      {welcome === "1" ? (
        <Alert tone="success" className="mb-6">
          Recibimos tu solicitud. Ya podés seguir el estado de tu verificación desde acá.
        </Alert>
      ) : null}

      <Card className="mb-5 overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:p-6">
          <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset ${status.ring}`}>
            <status.Icon className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[17px] font-semibold tracking-tight text-ink">{status.title}</h2>
              <VerificationBadge status={profile.verificationStatus} />
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{status.text}</p>
            {profile.verificationStatus === "REJECTED" && lastEvent?.note ? (
              <div className="mt-4 rounded-xl bg-red-50/70 px-4 py-3 text-sm text-red-900 ring-1 ring-red-100 ring-inset">
                <span className="font-medium">Motivo:</span> {lastEvent.note}
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {verified ? (
        <>
          <div className="mb-5 grid grid-cols-3 gap-3 sm:gap-4">
            {[
              { label: "Pacientes autorizados", value: grants.length, Icon: Users, tone: "text-brand-600" },
              { label: "Solicitudes pendientes", value: pending.length, Icon: Inbox, tone: "text-amber-600" },
              { label: "Por vencer (72 h)", value: expiring.length, Icon: AlarmClock, tone: "text-red-600" },
            ].map(({ label, value, Icon, tone }) => (
              <Card key={label} className="p-4 sm:p-5">
                <Icon className={`size-4 ${tone}`} />
                <p className="mt-3 text-2xl font-semibold tracking-tight text-ink tabular-nums sm:text-3xl">{value}</p>
                <p className="mt-0.5 text-[13px] leading-tight text-muted">{label}</p>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-5">
              {expiring.length ? (
                <Card className="border-amber-200/80">
                  <CardHeader title="Accesos próximos a vencer" description="Vencen en las próximas 72 horas." action={<AlarmClock className="size-4 text-amber-600" />} />
                  <CardBody>
                    <ul className="divide-y divide-line">
                      {expiring.map((g) => (
                        <li key={g.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                          <Link href={`/doctor/patients/${g.patient.id}`} className="truncate text-sm font-medium text-ink hover:text-brand-700">
                            {fullName(g.patient.user)}
                          </Link>
                          <span className="shrink-0 text-[13px] text-amber-700">{relativeExpiry(g.expiresAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              ) : null}

              <section aria-labelledby="patients-title">
                <h2 id="patients-title" className="mb-3 flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
                  <Users className="size-4 text-brand-600" /> Pacientes autorizados
                </h2>
                {grants.length === 0 ? (
                  <Card className="flex flex-col items-center px-6 py-12 text-center">
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-canvas text-muted ring-1 ring-line ring-inset">
                      <Users className="size-5" />
                    </span>
                    <p className="mt-4 text-sm font-medium text-ink">Todavía no tenés pacientes autorizados</p>
                    <p className="mt-1 max-w-xs text-sm text-muted">Ingresá el código de un paciente para enviarle una solicitud.</p>
                  </Card>
                ) : (
                  <ul className="space-y-3">
                    {grants.map((g) => (
                      <li key={g.id}>
                        <Link href={`/doctor/patients/${g.patient.id}`} className="block">
                          <Card className="p-4 transition-shadow hover:shadow-raised sm:p-5">
                            <div className="flex items-start gap-3">
                              <Avatar user={g.patient.user} className="size-10 text-sm" />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold tracking-tight text-ink">{fullName(g.patient.user)}</p>
                                  <Badge tone="brand" dot>
                                    Acceso activo
                                  </Badge>
                                </div>
                                <p className={`mt-0.5 flex items-center gap-1 text-[13px] ${isExpiringSoon(g.expiresAt) ? "text-amber-700" : "text-muted"}`}>
                                  <Clock className="size-3" /> {g.expiresAt ? `Vence ${formatDateTime(g.expiresAt)}` : "Sin vencimiento"}
                                </p>
                                <div className="mt-2.5">
                                  <PermissionChips summary={summarizePermissions(g.permissions, catNames)} />
                                </div>
                              </div>
                              <ChevronRight className="mt-2 size-4 shrink-0 text-muted" />
                            </div>
                          </Card>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="min-w-0 space-y-5">
              <Card>
                <CardHeader title="Solicitar acceso" description="Con el código que te comparte el paciente." />
                <CardBody>
                  <RequestAccessForm categories={categories} />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Solicitudes enviadas" description="Esperando respuesta del paciente." />
                <CardBody>
                  {pending.length === 0 ? (
                    <p className="text-sm text-muted">No tenés solicitudes pendientes.</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {pending.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink">{fullName(r.patient.user)}</p>
                            <p className="text-[12px] text-muted">Enviada {formatDateTime(r.createdAt)}</p>
                          </div>
                          <CancelRequestButton requestId={r.id} />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>
        </>
      ) : null}

      <Card className="mt-5">
        <CardHeader title="Información profesional" />
        <CardBody>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Nombre", fullName(user)],
              ["Email", user.email],
              ["Especialidad", profile.specialty],
              ["Matrícula", profile.licenseNumber],
              ["Jurisdicción", jurisdictionName(profile.jurisdiction)],
              [profile.verifiedAt ? "Verificado el" : "Solicitud enviada", formatDate(profile.verifiedAt ?? profile.createdAt)],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="truncate text-sm font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>
    </>
  );
}
