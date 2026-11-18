import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Pantalla vacía: explica qué falta y qué hacer, con una acción clara. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "px-4 py-8" : "px-6 py-14 sm:py-16", className)}>
      <span className="relative flex size-14 items-center justify-center">
        <span aria-hidden className="absolute inset-0 rounded-2xl bg-brand-50 ring-1 ring-brand-100 ring-inset" />
        <span aria-hidden className="absolute -inset-2 rounded-[22px] bg-brand-50/40" />
        <Icon aria-hidden className="relative size-6 text-brand-600" />
      </span>
      <p className="mt-5 text-[15px] font-semibold tracking-tight text-ink">{title}</p>
      {description ? <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
