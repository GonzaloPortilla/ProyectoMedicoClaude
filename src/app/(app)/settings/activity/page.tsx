import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, KeyRound, Settings2, Stethoscope, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/features/access/format";
import { listActivity, type ActivityFilter, type ActivityItem } from "@/server/audit/activity";
import { sweepExpiredGrants } from "@/server/access/expiry";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Actividad de mi cuenta" };

const FILTERS: { value: ActivityFilter; label: string; patientOnly?: boolean }[] = [
  { value: "all", label: "Todo" },
  { value: "doctors", label: "Accesos de médicos", patientOnly: true },
  { value: "security", label: "Seguridad" },
  { value: "mine", label: "Mis acciones" },
];

const TONES: Record<ActivityItem["tone"], { Icon: typeof User; cls: string }> = {
  doctor: { Icon: Stethoscope, cls: "bg-violet-50 text-violet-600 ring-violet-100" },
  security: { Icon: KeyRound, cls: "bg-sky-50 text-sky-600 ring-sky-100" },
  self: { Icon: User, cls: "bg-ink/[0.04] text-ink-soft ring-line" },
  system: { Icon: Settings2, cls: "bg-ink/[0.04] text-ink-soft ring-line" },
  warning: { Icon: AlertTriangle, cls: "bg-amber-50 text-amber-600 ring-amber-100" },
};

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const patient = user.roles.includes("PATIENT") ? await db.patientProfile.findUnique({ where: { userId: user.id }, select: { id: true } }) : null;
  const filters = FILTERS.filter((f) => !f.patientOnly || patient);
  const filter = (filters.find((f) => f.value === sp.filter)?.value ?? "all") as ActivityFilter;
  const before = typeof sp.before === "string" && /^\d{1,19}$/.test(sp.before) ? BigInt(sp.before) : undefined;
  if (patient) await sweepExpiredGrants();
  const { items, nextCursor } = await listActivity({ userId: user.id, patientId: patient?.id ?? null, filter, before });

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.value}
            href={f.value === "all" ? "/settings/activity" : `/settings/activity?filter=${f.value}`}
            aria-current={filter === f.value ? "true" : undefined}
            className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors", filter === f.value ? "bg-ink text-white" : "bg-surface text-ink-soft ring-1 ring-line hover:text-ink")}
          >
            {f.label}
          </Link>
        ))}
      </div>
      <p className="mb-4 text-[13px] text-muted">Este registro no se puede editar ni borrar. Si ves algo que no reconocés, cambiá tu contraseña y revocá los accesos que no quieras mantener.</p>

      {items.length === 0 ? (
        <Card className="px-6 py-12 text-center text-sm text-muted">No hay actividad para mostrar.</Card>
      ) : (
        <Card className="overflow-hidden">
          <ol className="divide-y divide-line" data-testid="activity-list">
            {items.map((item) => {
              const { Icon, cls } = TONES[item.tone];
              return (
                <li key={item.id} className="flex gap-3 px-4 py-3.5 sm:px-6">
                  <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset", cls)}>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm break-words text-ink">{item.text}</p>
                    {item.detail ? <p className="mt-0.5 text-[13px] break-words text-muted">{item.detail}</p> : null}
                  </div>
                  <time dateTime={item.at.toISOString()} className="shrink-0 text-[12px] text-muted tabular-nums">
                    {formatDateTime(item.at)}
                  </time>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
      {nextCursor ? (
        <div className="mt-4 flex justify-center">
          <Link href={`/settings/activity?${new URLSearchParams({ ...(filter !== "all" ? { filter } : {}), before: nextCursor })}`} className="rounded-xl border border-line-strong bg-surface px-4 py-2 text-sm font-medium shadow-card hover:bg-canvas">
            Ver actividad anterior
          </Link>
        </div>
      ) : null}
    </div>
  );
}
