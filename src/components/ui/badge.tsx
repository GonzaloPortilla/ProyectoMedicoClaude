import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "brand" | "amber" | "red" | "blue" | "violet";

const tones: Record<Tone, string> = {
  neutral: "bg-ink/[0.05] text-ink-soft ring-ink/[0.06]",
  brand: "bg-brand-50 text-brand-700 ring-brand-200/70",
  amber: "bg-amber-50 text-amber-800 ring-amber-200/70",
  red: "bg-red-50 text-red-700 ring-red-200/70",
  blue: "bg-sky-50 text-sky-800 ring-sky-200/70",
  violet: "bg-violet-50 text-violet-800 ring-violet-200/70",
};

export function Badge({ tone = "neutral", className, dot, children, ...props }: ComponentProps<"span"> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tones[tone], className)}
      {...props}
    >
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" /> : null}
      {children}
    </span>
  );
}
