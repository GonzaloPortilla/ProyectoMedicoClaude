import type { Metadata } from "next";
import { BadgeCheck, CircleX, Hourglass, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { VerificationBadge } from "@/components/status/verification-badge";
import { getOwnDoctorProfile } from "@/features/doctor/queries";
import { jurisdictionName } from "@/lib/jurisdictions";
import { formatDate, fullName, greeting } from "@/lib/utils";
import { requireRole } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Panel profesional" };

const STATUS_COPY = {
  PENDING: {
    Icon: Hourglass,
    ring: "bg-amber-50 text-amber-600 ring-amber-100",
    title: "Tu matrícula está en revisión",
    text: "Estamos verificando tus datos profesionales. Te avisaremos cuando tu cuenta esté habilitada. Este proceso suele demorar entre 24 y 72 horas hábiles.",
  },
  VERIFIED: {
    Icon: BadgeCheck,
    ring: "bg-brand-50 text-brand-600 ring-brand-100",
    title: "Tu cuenta profesional está verificada",
    text: "Tu matrícula fue validada. Cuando un paciente te autorice, vas a poder consultar su información desde este panel.",
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

  const status = STATUS_COPY[profile.verificationStatus];
  const lastEvent = profile.verifications[0];

  return (
    <>
      <PageHeader eyebrow="Panel profesional" title={`${greeting()}, Dr/a. ${user.lastName}`} description="Gestioná tu perfil profesional y, próximamente, a tus pacientes autorizados." />

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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader title="Información profesional" />
          <CardBody>
            <dl className="divide-y divide-line">
              {[
                ["Nombre", fullName(user)],
                ["Email", user.email],
                ["Especialidad", profile.specialty],
                ["Matrícula", profile.licenseNumber],
                ["Jurisdicción", jurisdictionName(profile.jurisdiction)],
                ["Solicitud enviada", formatDate(profile.createdAt)],
                ...(profile.verifiedAt ? [["Verificado el", formatDate(profile.verifiedAt)]] : []),
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-3">
                  <dt className="w-36 shrink-0 text-sm text-muted">{label}</dt>
                  <dd className="min-w-0 text-sm font-medium break-words text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Pacientes autorizados" description="Pacientes que te dieron acceso a su información." action={<Badge>Próximamente</Badge>} />
          <CardBody className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center py-8 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-canvas text-muted ring-1 ring-line ring-inset">
                <Users className="size-5" />
              </span>
              <p className="mt-4 text-sm font-medium text-ink">Todavía no tenés pacientes autorizados</p>
              <p className="mt-1 max-w-xs text-sm text-muted">
                Cuando un paciente te otorgue acceso, aparecerá en esta lista. Cada consulta quedará registrada.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
