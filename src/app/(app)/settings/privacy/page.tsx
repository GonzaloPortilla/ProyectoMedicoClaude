import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Download, Eye, EyeOff, Lock, ShieldCheck, UserRoundCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DoctorIdentity } from "@/features/access/components/doctor-identity";
import { formatDateTime } from "@/features/access/format";
import { requireUser } from "@/server/auth/dal";
import { listGrantsForPatient } from "@/server/access/requests";
import { sweepExpiredGrants } from "@/server/access/expiry";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Privacidad" };

const PRINCIPLES = [
  { Icon: Lock, title: "Privado por defecto", text: "Nadie ve tu información médica salvo vos. Ningún médico puede buscarte." },
  { Icon: UserRoundCheck, title: "Acceso sólo con tu autorización", text: "Elegís qué compartir, con quién y por cuánto tiempo. Podés revocarlo cuando quieras." },
  { Icon: EyeOff, title: "Lo mínimo indispensable", text: "Los médicos no ven tus datos de contacto. Las fotos se guardan sin ubicación GPS." },
  { Icon: Eye, title: "Todo queda registrado", text: "Cada acceso a tu información queda en tu registro de actividad y no se puede borrar." },
];

export default async function SettingsPrivacyPage() {
  const user = await requireUser();
  const isPatient = user.roles.includes("PATIENT");
  const patient = isPatient ? await db.patientProfile.findUnique({ where: { userId: user.id }, select: { id: true } }) : null;
  if (patient) await sweepExpiredGrants();
  const grants = patient ? await listGrantsForPatient(patient.id) : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PRINCIPLES.map(({ Icon, title, text }) => (
          <Card key={title} className="flex gap-3 p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 ring-inset">
              <Icon className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">{title}</p>
              <p className="text-[13px] text-muted">{text}</p>
            </div>
          </Card>
        ))}
      </div>

      {grants ? (
        <Card>
          <CardHeader
            title="Médicos con acceso a tu información"
            action={
              <Link href="/patient/doctors" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-900">
                Gestionar <ChevronRight className="size-4" />
              </Link>
            }
          />
          <CardBody>
            {grants.active.length === 0 ? (
              <p className="text-sm text-muted">Ningún profesional tiene acceso en este momento.</p>
            ) : (
              <ul className="divide-y divide-line">
                {grants.active.map((g) => (
                  <li key={g.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <DoctorIdentity doctor={g.doctor} />
                    <Badge tone="brand">{g.expiresAt ? `Hasta ${formatDateTime(g.expiresAt)}` : "Sin vencimiento"}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Qué puede ver el equipo de administración" />
        <CardBody>
          <ul className="space-y-2 text-sm text-ink-soft">
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" /> Puede ver tu nombre, email, roles y fecha de alta para gestionar cuentas y verificar profesionales.
            </li>
            <li className="flex gap-2">
              <EyeOff className="mt-0.5 size-4 shrink-0 text-brand-600" /> No puede ver tu información médica, tus estudios ni tus archivos: el sistema no le da acceso.
            </li>
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Tus datos" description="Descargá una copia de toda la información que guardamos sobre vos, en formato JSON." />
        <CardBody>
          <form method="post" action="/api/export">
            <Button type="submit" variant="secondary">
              <Download className="size-4" /> Descargar mis datos
            </Button>
          </form>
          <p className="mt-3 text-[13px] text-muted">
            Incluye tu perfil, tu información de salud, tus registros e informes, los accesos que otorgaste y tu actividad. Los archivos se listan con sus datos; podés descargarlos desde cada estudio. Para eliminar tu cuenta, escribinos a soporte.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
