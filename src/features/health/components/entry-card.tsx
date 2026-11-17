import type { LucideIcon } from "lucide-react";
import type { DataSource } from "@/generated/prisma/enums";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/status/source-badge";
import { KIND_CONFIG, type HealthKind } from "@/features/health/config";
import { AddEntryForm } from "@/features/health/components/add-entry-form";
import { DeleteEntryButton } from "@/features/health/components/delete-entry-button";
import { cn } from "@/lib/utils";

export type EntryItem = {
  id: string;
  primary: string;
  secondary?: string | null;
  badge?: { label: string; tone: "neutral" | "brand" | "amber" | "red" | "blue" | "violet" } | null;
  source?: DataSource;
};

const tones = {
  rose: "bg-rose-50 text-rose-600 ring-rose-100",
  amber: "bg-amber-50 text-amber-600 ring-amber-100",
  sky: "bg-sky-50 text-sky-600 ring-sky-100",
  violet: "bg-violet-50 text-violet-600 ring-violet-100",
  brand: "bg-brand-50 text-brand-600 ring-brand-100",
  red: "bg-red-50 text-red-600 ring-red-100",
  slate: "bg-ink/[0.04] text-ink-soft ring-line",
} as const;

/** Tarjeta de una sección de "Mi Salud": lista de datos + alta rápida. */
export function EntryCard({ kind, items, icon: Icon, tone }: { kind: HealthKind; items: EntryItem[]; icon: LucideIcon; tone: keyof typeof tones }) {
  const config = KIND_CONFIG[kind];
  return (
    <Card id={kind} className="flex scroll-mt-24 flex-col">
      <div className="flex items-start gap-3 px-5 pt-5 sm:px-6">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset", tones[tone])}>
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
            {config.title}
            {items.length > 0 ? <span className="text-xs font-medium text-muted tabular-nums">{items.length}</span> : null}
          </h2>
          <p className="text-[13px] text-muted">{config.description}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col px-5 pt-3 pb-4 sm:px-6">
        {items.length === 0 ? (
          <p className="py-3 text-sm text-muted">{config.empty}</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium break-words text-ink">
                    {item.primary}
                    {item.badge ? <Badge tone={item.badge.tone}>{item.badge.label}</Badge> : null}
                  </p>
                  {item.secondary ? <p className="mt-0.5 text-[13px] break-words text-muted">{item.secondary}</p> : null}
                </div>
                {item.source && item.source !== "PATIENT" ? <SourceBadge source={item.source} /> : null}
                <DeleteEntryButton kind={kind} id={item.id} label={item.primary} />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto pt-2">
          <AddEntryForm kind={kind} />
        </div>
      </div>
    </Card>
  );
}
