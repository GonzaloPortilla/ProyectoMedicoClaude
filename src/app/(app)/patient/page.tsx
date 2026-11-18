import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronRight, Droplet, FileText, HeartPulse, Inbox, Pill, Plus, ShieldAlert, Share2, Siren, Sparkles, UserRoundCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DoctorIdentity } from "@/features/access/components/doctor-identity";
import { formatDateTime, relativeExpiry } from "@/features/access/format";
import { BLOOD_TYPE_LABELS, SEVERITY_LABELS } from "@/features/health/config";
import { getOwnPatientProfile, profileCompletion } from "@/features/patient/queries";
import { CategoryIcon } from "@/features/records/components/category-icon";
import { listActivity } from "@/server/audit/activity";
import { listGrantsForPatient, listPendingRequestsForPatient } from "@/server/access/requests";
import { sweepExpiredGrants } from "@/server/access/expiry";
import { getHealthOverview } from "@/server/medical/health";
import { listRecords } from "@/server/medical/records";
import { db } from "@/server/db";
import { requirePatient } from "@/server/patient/context";
import { formatDate, greeting, joinUnique } from "@/lib/utils";

export const metadata: Metadata = { title: "Inicio" };

function SectionTitle({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
      {href ? (
        <Link href={href} className="inline-flex items-center gap-0.5 text-[13px] font-medium text-brand-700 hover:text-brand-900">
          {linkLabel ?? "Ver todo"} <ChevronRight className="size-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

function Stat({ icon: Icon, label, children }: { icon: typeof Droplet; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon aria-hidden className="size-3.5" /> {label}
      </p>
      <div className="mt-1.5 text-sm text-ink">{children}</div>
    </div>
  );
}

export default async function PatientDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, patientId } = await requirePatient();
  await sweepExpiredGrants();
  const [profile, { welcome }, health, records, grants, pending, activity, toReview] = await Promise.all([
    getOwnPatientProfile(user.id),
    searchParams,
    getHealthOverview(patientId),
    listRecords(patientId, { take: 4 }),
    listGrantsForPatient(patientId),
    listPendingRequestsForPatient(patientId),
    listActivity({ userId: user.id, patientId, filter: "highlights", take: 4 }),
    db.documentExtraction.findMany({ where: { patientId, status: "READY_FOR_REVIEW" }, orderBy: { createdAt: "desc" }, take: 5, select: { recordId: true } }),
  ]);
  const completion = profileCompletion(profile);
  const activeConditions = health.conditions.filter((c) => c.status === "ACTIVE");
  const todayRaw = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const today = todayRaw.charAt(0).toUpperCase() + todayRaw.slice(1);

  return (
    <>
      <PageHeader
        eyebrow={today}
        title={`${greeting()}, ${user.firstName}`}
        description={welcome === "1" ? "Tu cuenta está lista. Empezá cargando tu información de salud." : "Tu información de salud, en un solo lugar."}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/patient/documents/new">
              <Plus className="size-4" /> Subir estudio
            </ButtonLink>
            <ButtonLink href="/patient/doctors" variant="secondary">
              <Share2 className="size-4" /> Compartir con mi médico
            </ButtonLink>
          </div>
        }
      />

      {pending.length ? (
        <Card className="mb-6 border-amber-200 bg-gradient-to-r from-amber-50/80 to-surface p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Inbox className="size-5" />
              </span>
              <div>
                <p className="font-semibold text-ink">
                  {pending.length === 1 ? `Dr/a. ${pending[0]!.doctor.firstName} ${pending[0]!.doctor.lastName} quiere ver tu información` : `${pending.length} profesionales quieren ver tu información`}
                </p>
                <p className="text-sm text-ink-soft">Vos decidís qué compartir y por cuánto tiempo.</p>
              </div>
            </div>
            <ButtonLink href={pending.length === 1 ? `/patient/doctors/requests/${pending[0]!.id}` : "/patient/doctors"} className="shrink-0">
              Revisar solicitud <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
        </Card>
      ) : null}

      {toReview.length ? (
        <Link
          href={`/patient/documents/${toReview[0]!.recordId}/review`}
          className="mb-6 flex items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200/70 ring-inset hover:bg-amber-100/60"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="size-4 shrink-0" aria-hidden />
            {toReview.length === 1 ? "Tenés un estudio analizado para revisar." : `Tenés ${toReview.length} estudios analizados para revisar.`} Nada se guarda como definitivo hasta que lo confirmes.
          </span>
          <ChevronRight className="size-4 shrink-0" />
        </Link>
      ) : null}

      {completion.percent < 100 ? (
        <Link href="/patient/profile" className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-line-strong px-4 py-3 text-sm text-ink-soft hover:bg-surface">
          <span>
            Completá tus datos de identificación ({completion.done} de {completion.total}) para que tus médicos te identifiquen correctamente.
          </span>
          <ChevronRight className="size-4 shrink-0" />
        </Link>
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-10">
        <div className="min-w-0 space-y-8">
          <section>
            <SectionTitle title="Tu salud de un vistazo" href="/patient/health" linkLabel="Mi salud" />
            <Card className="grid grid-cols-1 gap-6 p-5 sm:grid-cols-2 sm:p-6">
              <Stat icon={Droplet} label="Grupo sanguíneo">
                <span className="text-2xl font-semibold tracking-tight">{health.vitals?.bloodType ? BLOOD_TYPE_LABELS[health.vitals.bloodType] : "—"}</span>
              </Stat>
              <Stat icon={ShieldAlert} label="Alergias">
                {health.allergies.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {health.allergies.map((a) => (
                      <Badge key={a.id} tone={a.severity === "SEVERE" ? "red" : "amber"}>
                        {a.name}
                        {a.severity === "SEVERE" ? ` · ${SEVERITY_LABELS[a.severity]}` : ""}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted">Sin alergias cargadas</span>
                )}
              </Stat>
              <Stat icon={Pill} label="Medicación actual">
                {health.medications.length ? (
                  <ul className="space-y-0.5">
                    {health.medications.map((m) => (
                      <li key={m.id}>
                        <span className="font-medium">{m.name}</span>
                        {m.dosage ? <span className="text-muted"> · {m.dosage}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted">Sin medicación cargada</span>
                )}
              </Stat>
              <Stat icon={HeartPulse} label="Condiciones activas">
                {activeConditions.length ? activeConditions.map((c) => c.name).join(", ") : <span className="text-muted">Ninguna cargada</span>}
              </Stat>
            </Card>
          </section>

          <section>
            <SectionTitle title="Últimos estudios" href="/patient/documents" />
            <Card className="overflow-hidden">
              {records.length === 0 ? (
                <EmptyState
                  compact
                  icon={FileText}
                  title="Todavía no cargaste ningún estudio"
                  description="Subí un PDF o una foto de tu último análisis. Lleva menos de un minuto."
                  action={
                    <ButtonLink href="/patient/documents/new" size="sm">
                      <Plus className="size-4" /> Subir mi primer estudio
                    </ButtonLink>
                  }
                />
              ) : (
                <ul className="divide-y divide-line">
                  {records.map((r) => (
                    <li key={r.id}>
                      <Link href={`/patient/documents/${r.id}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-canvas/60">
                        <CategoryIcon slug={r.category.slug} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{r.title}</p>
                          <p className="truncate text-[13px] text-muted">
                            <span className="sm:hidden">{formatDate(r.occurredOn)} · </span>
                            {joinUnique([r.category.name, r.institution?.name])}
                          </p>
                        </div>
                        <span className="hidden shrink-0 text-[13px] text-muted tabular-nums sm:block">{formatDate(r.occurredOn)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </div>

        <aside className="min-w-0 space-y-8">
          <section>
            <SectionTitle title="Quién ve tu información" href="/patient/doctors" linkLabel="Mis médicos" />
            <Card className="overflow-hidden">
              {grants.active.length === 0 ? (
                <EmptyState
                  compact
                  icon={UserRoundCheck}
                  title="Ningún médico tiene acceso"
                  description="Tu información es privada. Cuando quieras compartirla, generá un código para tu médico."
                  action={
                    <ButtonLink href="/patient/doctors" size="sm" variant="secondary">
                      Compartir con mi médico
                    </ButtonLink>
                  }
                />
              ) : (
                <ul className="divide-y divide-line">
                  {grants.active.map((g) => (
                    <li key={g.id} className="space-y-2 px-5 py-4">
                      <DoctorIdentity doctor={g.doctor} />
                      <p className="pl-[52px] text-[13px] text-muted">{g.expiresAt ? `${relativeExpiry(g.expiresAt)} · ${formatDateTime(g.expiresAt)}` : "Sin vencimiento"}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          <section>
            <SectionTitle title="Actividad reciente" href="/settings/activity" />
            <Card className="px-5 py-2">
              {activity.items.length === 0 ? (
                <p className="py-4 text-sm text-muted">Todavía no hay actividad.</p>
              ) : (
                <ol className="divide-y divide-line">
                  {activity.items.map((i) => (
                    <li key={i.id} className="py-3">
                      <p className="text-sm break-words text-ink">{i.text}</p>
                      <p className="mt-0.5 text-xs text-muted tabular-nums">{formatDateTime(i.at)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </section>

          <Link href="/patient/emergency" className="group flex items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-raised">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-red-100 ring-inset">
              <Siren className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Información de emergencia</p>
              <p className="text-[13px] text-muted">Revisá qué datos vitales tener a mano.</p>
            </div>
            <ChevronRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
          </Link>
        </aside>
      </div>
    </>
  );
}
