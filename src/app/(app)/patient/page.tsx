import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calendar, CalendarClock, ChevronRight, FileText, HeartPulse, IdCard, MapPin, Phone, Plus, Siren, Stethoscope, UserRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FeatureCard } from "@/features/patient/components/feature-card";
import { getOwnPatientProfile, profileCompletion } from "@/features/patient/queries";
import { SEX_LABELS } from "@/features/patient/schemas";
import { jurisdictionName } from "@/lib/jurisdictions";
import { formatDate, greeting } from "@/lib/utils";
import { requirePatient } from "@/server/patient/context";
import { countRecords } from "@/server/medical/records";
import { db } from "@/server/db";
import { listGrantsForPatient, listPendingRequestsForPatient } from "@/server/access/requests";

export const metadata: Metadata = { title: "Inicio" };

export default async function PatientDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, patientId } = await requirePatient();
  const [profile, { welcome }, counts, health, grants, pendingRequests] = await Promise.all([
    getOwnPatientProfile(user.id),
    searchParams,
    countRecords(patientId),
    db.patientProfile.findUnique({
      where: { id: patientId },
      select: { _count: { select: { allergies: true, conditions: true, medications: true, emergencyContacts: true } }, healthProfile: { select: { bloodType: true } } },
    }),
    listGrantsForPatient(patientId),
    listPendingRequestsForPatient(patientId),
  ]);
  const healthItems = health ? Object.values(health._count).reduce((a, b) => a + b, 0) + (health.healthProfile?.bloodType ? 1 : 0) : 0;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const completion = profileCompletion(profile);

  const rows = [
    { icon: Calendar, label: "Fecha de nacimiento", value: formatDate(profile?.dateOfBirth) },
    { icon: UserRound, label: "Sexo", value: profile?.sex ? SEX_LABELS[profile.sex] : "—" },
    { icon: IdCard, label: "Documento", value: profile?.documentId ?? "—" },
    { icon: Phone, label: "Teléfono", value: profile?.phone ?? "—" },
    {
      icon: MapPin,
      label: "Ubicación",
      value: [...new Set([profile?.city, profile?.province ? jurisdictionName(profile.province) : null].filter(Boolean))].join(", ") || "—",
    },
  ];

  return (
    <>
      <PageHeader
        action={
          <ButtonLink href="/patient/documents/new">
            <Plus className="size-4" /> Subir estudio
          </ButtonLink>
        }
        eyebrow={new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date())} title={`${greeting()}, ${user.firstName}`} description="Este es tu espacio personal de salud." />

      {pendingRequests.length ? (
        <Alert tone="info" className="mb-6">
          Tenés {plural(pendingRequests.length, "solicitud de acceso pendiente", "solicitudes de acceso pendientes")}.{" "}
          <Link href="/patient/doctors" className="font-medium underline underline-offset-2">
            Revisar
          </Link>
        </Alert>
      ) : null}

      {welcome === "1" ? (
        <Alert tone="success" className="mb-6">
          ¡Tu cuenta está lista! Completá tu perfil para aprovechar mejor la plataforma.
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Mi perfil"
            description={`${user.email}`}
            action={
              <Link href="/patient/profile" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-900">
                Editar <ChevronRight className="size-4" />
              </Link>
            }
          />
          <CardBody>
            <dl className="divide-y divide-line">
              {rows.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:gap-3">
                    <dt className="shrink-0 text-sm text-muted sm:w-40">{label}</dt>
                    <dd className="min-w-0 text-sm font-medium break-words text-ink">{value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Completá tu perfil" description="Tus datos básicos ayudan a identificarte correctamente." />
          <CardBody className="flex flex-1 flex-col justify-between gap-6">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-semibold tracking-tight text-ink tabular-nums">{completion.percent}%</span>
                <span className="text-sm text-muted">
                  {completion.done} de {completion.total} datos
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/[0.06]" role="progressbar" aria-valuenow={completion.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Perfil completado">
                <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-[width]" style={{ width: `${completion.percent}%` }} />
              </div>
            </div>
            <ButtonLink href="/patient/profile" variant={completion.percent === 100 ? "secondary" : "primary"} className="w-full">
              {completion.percent === 100 ? "Revisar mis datos" : "Completar datos"} <ArrowRight className="size-4" />
            </ButtonLink>
          </CardBody>
        </Card>
      </div>

      <section className="mt-10" aria-labelledby="features-title">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 id="features-title" className="text-[17px] font-semibold tracking-tight text-ink">
              Tu salud
            </h2>
            <p className="mt-0.5 text-sm text-muted">Accesos rápidos a tu información médica.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <FeatureCard icon={HeartPulse} tone="rose" href="/patient/health" title="Mi salud" description="Alergias, condiciones, medicación, cirugías, vacunas y más." stat={plural(healthItems, "dato cargado", "datos cargados")} />
          <FeatureCard icon={FileText} tone="sky" href="/patient/documents" title="Mis estudios" description="Tus análisis, imágenes e informes médicos, siempre a mano." stat={plural(counts.files, "archivo", "archivos")} />
          <FeatureCard icon={CalendarClock} tone="brand" href="/patient/history" title="Mi historial" description="Toda tu historia médica en orden cronológico." stat={plural(counts.records, "registro", "registros")} />
          <FeatureCard icon={Siren} tone="red" href="/patient/emergency" title="Información de emergencia" description="Elegí los datos vitales a tener a mano ante una urgencia." />
          <FeatureCard
            icon={Stethoscope}
            tone="violet"
            href="/patient/doctors"
            title="Mis médicos"
            description="Elegí qué profesionales pueden ver tu información y por cuánto tiempo."
            stat={[plural(grants.active.length, "acceso activo", "accesos activos"), pendingRequests.length ? plural(pendingRequests.length, "solicitud pendiente", "solicitudes pendientes") : null].filter(Boolean).join(" · ")}
          />
        </div>
      </section>
    </>
  );
}
