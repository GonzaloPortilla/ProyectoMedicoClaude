import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Hourglass, ShieldCheck, Stethoscope, UserRound, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAdminStats } from "@/features/admin/queries";
import { requireRole } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Administración" };

export default async function AdminOverviewPage() {
  await requireRole("ADMIN");
  const stats = await getAdminStats();

  const tiles = [
    { label: "Usuarios", value: stats.users, Icon: Users, href: "/admin/users" },
    { label: "Pacientes", value: stats.patients, Icon: UserRound, href: "/admin/users?role=PATIENT" },
    { label: "Médicos", value: stats.doctors, Icon: Stethoscope, href: "/admin/doctors?status=ALL" },
    { label: "Verificaciones pendientes", value: stats.pending, Icon: Hourglass, href: "/admin/doctors?status=PENDING", highlight: stats.pending > 0 },
  ];

  return (
    <>
      <PageHeader eyebrow="Administración" title="Resumen" description="Gestión de cuentas y verificación de profesionales." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(({ label, value, Icon, href, highlight }) => (
          <Link key={label} href={href} className="group">
            <Card className="h-full p-5 transition-shadow group-hover:shadow-raised">
              <div className="flex items-center justify-between">
                <Icon className={highlight ? "size-4 text-amber-600" : "size-4 text-muted"} />
                <ArrowRight className="size-4 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <p className="mt-4 text-3xl font-semibold tracking-tight text-ink tabular-nums">{value}</p>
              <p className="mt-1 text-sm text-muted">{label}</p>
            </Card>
          </Link>
        ))}
      </div>

      {stats.pending > 0 ? (
        <Card className="mt-5 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100 ring-inset">
              <BadgeCheck className="size-5" />
            </span>
            <div>
              <p className="font-medium text-ink">
                {stats.pending === 1 ? "Hay 1 profesional esperando verificación" : `Hay ${stats.pending} profesionales esperando verificación`}
              </p>
              <p className="text-sm text-muted">Revisá la matrícula y la jurisdicción antes de aprobar.</p>
            </div>
          </div>
          <ButtonLink href="/admin/doctors?status=PENDING">Revisar solicitudes</ButtonLink>
        </Card>
      ) : null}

      <p className="mt-8 flex items-start gap-2 text-[13px] text-muted">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        El rol de administrador permite gestionar cuentas y verificaciones. No otorga acceso a información médica de los pacientes.
      </p>
    </>
  );
}
