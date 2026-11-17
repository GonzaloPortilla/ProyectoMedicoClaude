import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const tones = {
  rose: "from-rose-50 to-white text-rose-600 ring-rose-100",
  sky: "from-sky-50 to-white text-sky-600 ring-sky-100",
  violet: "from-violet-50 to-white text-violet-600 ring-violet-100",
  red: "from-red-50 to-white text-red-600 ring-red-100",
  brand: "from-brand-50 to-white text-brand-600 ring-brand-100",
} as const;

/** Tarjeta para funciones futuras (todavía no implementadas). */
export function FeatureCard({ icon: Icon, title, description, tone }: { icon: LucideIcon; title: string; description: string; tone: keyof typeof tones }) {
  return (
    <div aria-disabled className="group relative flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between">
        <span className={cn("flex size-11 items-center justify-center rounded-2xl bg-gradient-to-b ring-1 ring-inset", tones[tone])}>
          <Icon className="size-5" />
        </span>
        <Badge>Próximamente</Badge>
      </div>
      <h3 className="mt-5 text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
    </div>
  );
}
