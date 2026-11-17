import type { Metadata } from "next";
import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { VerificationBadge, VERIFICATION_LABELS } from "@/components/status/verification-badge";
import { Avatar } from "@/components/shell/user-card";
import { DoctorDecisionForm } from "@/features/admin/components/doctor-decision-form";
import { listDoctors } from "@/features/admin/queries";
import { doctorStatusFilterSchema } from "@/features/admin/schemas";
import { jurisdictionName } from "@/lib/jurisdictions";
import { cn, formatDate, fullName } from "@/lib/utils";
import { requireRole } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Médicos" };

const FILTERS = ["PENDING", "VERIFIED", "REJECTED", "ALL"] as const;

export default async function AdminDoctorsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireRole("ADMIN");
  const params = await searchParams;
  const status = doctorStatusFilterSchema.parse(params.status);
  const notice = params.notice === "verified" ? "Profesional verificado." : params.notice === "rejected" ? "Solicitud rechazada." : null;
  const { doctors, counts } = await listDoctors(status);

  return (
    <>
      <PageHeader eyebrow="Administración" title="Médicos" description="Verificá la matrícula de cada profesional antes de habilitarlo." />

      {notice ? (
        <Alert tone="success" className="mb-4">
          {notice}
        </Alert>
      ) : null}

      <div className="-mx-4 mb-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <div className="inline-flex rounded-xl bg-ink/[0.05] p-1" role="tablist" aria-label="Filtrar por estado">
          {FILTERS.map((f) => {
            const active = status === f;
            return (
              <Link
                key={f}
                href={`/admin/doctors?status=${f}`}
                role="tab"
                aria-selected={active}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
                  active ? "bg-surface text-ink shadow-card" : "text-ink-soft hover:text-ink",
                )}
              >
                {f === "ALL" ? "Todos" : `${VERIFICATION_LABELS[f]}s`}
                <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", active ? "bg-ink/[0.06]" : "bg-ink/[0.04]")}>{counts[f]}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {doctors.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-canvas text-muted ring-1 ring-line ring-inset">
            <Stethoscope className="size-5" />
          </span>
          <p className="mt-4 text-sm font-medium text-ink">No hay profesionales en este estado</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {doctors.map((d) => {
            const last = d.verifications[0];
            const isSelf = d.user.id === admin.id;
            return (
              <li key={d.id}>
                <Card className="p-5 sm:p-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-4">
                      <Avatar user={d.user} className="size-10 text-sm" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold tracking-tight text-ink">{fullName(d.user)}</p>
                          <VerificationBadge status={d.verificationStatus} />
                        </div>
                        <p className="truncate text-sm text-muted">{d.user.email}</p>
                        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4 lg:grid-cols-[auto_auto_auto_auto]">
                          <div>
                            <dt className="text-xs text-muted">Especialidad</dt>
                            <dd className="font-medium text-ink">{d.specialty}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted">Matrícula</dt>
                            <dd className="font-mono text-[13px] font-medium text-ink">{d.licenseNumber}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted">Jurisdicción</dt>
                            <dd className="font-medium text-ink">{jurisdictionName(d.jurisdiction)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted">Solicitud</dt>
                            <dd className="font-medium text-ink tabular-nums">{formatDate(d.createdAt)}</dd>
                          </div>
                        </dl>
                        {last && last.reviewer ? (
                          <p className="mt-3 text-xs text-muted">
                            Última revisión: {VERIFICATION_LABELS[last.status].toLowerCase()} por {fullName(last.reviewer)} el {formatDate(last.createdAt)}
                            {last.note ? ` — “${last.note}”` : ""}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="shrink-0 lg:pt-1">
                      {isSelf ? (
                        <p className="text-xs text-muted">No podés revisar tu propia solicitud.</p>
                      ) : (
                        <DoctorDecisionForm doctorProfileId={d.id} status={d.verificationStatus} returnTo={status} />
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
