import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { NameForm } from "@/features/settings/components/name-form";
import { requireUser } from "@/server/auth/dal";
import { ROLE_LABELS, sortRoles } from "@/server/auth/roles";
import { db } from "@/server/db";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Datos personales" };

export default async function SettingsProfilePage() {
  const user = await requireUser();
  const account = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { createdAt: true, emailVerifiedAt: true, lastLoginAt: true } });
  const isPatient = user.roles.includes("PATIENT");

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader title="Nombre" description="Así te ven los profesionales que autorices." />
        <CardBody>
          <NameForm firstName={user.firstName} lastName={user.lastName} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Cuenta" />
        <CardBody>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Email</dt>
              <dd className="flex flex-wrap items-center gap-2 font-medium break-all text-ink">
                {user.email}
                {account.emailVerifiedAt ? (
                  <Badge tone="brand">
                    <BadgeCheck className="size-3" /> Verificado
                  </Badge>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Roles</dt>
              <dd className="font-medium text-ink">{sortRoles(user.roles).map((r) => ROLE_LABELS[r]).join(" · ")}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Cuenta creada</dt>
              <dd className="font-medium text-ink">{formatDate(account.createdAt)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-[13px] text-muted">Para cambiar tu email escribinos a soporte: por seguridad requiere verificar la nueva dirección.</p>
          {isPatient ? (
            <Link href="/patient/profile" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-900">
              Editar datos de identificación (DNI, nacimiento…) <ChevronRight className="size-4" />
            </Link>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
