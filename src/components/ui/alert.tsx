import { CircleCheck, CircleX, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  success: { cls: "bg-brand-50 text-brand-900 ring-brand-200/70", Icon: CircleCheck, iconCls: "text-brand-600" },
  error: { cls: "bg-red-50 text-red-900 ring-red-200/70", Icon: CircleX, iconCls: "text-red-500" },
  info: { cls: "bg-sky-50 text-sky-900 ring-sky-200/70", Icon: Info, iconCls: "text-sky-600" },
};

export function Alert({ tone = "info", children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  const { cls, Icon, iconCls } = tones[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-2.5 rounded-xl px-3.5 py-3 text-sm ring-1 ring-inset", cls, className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", iconCls)} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
