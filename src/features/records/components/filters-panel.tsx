"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** En el celular los filtros se pliegan detrás de un botón; en escritorio quedan visibles. */
export function FiltersPanel({ activeCount, children }: { activeCount: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="history-filters"
        className="flex h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink shadow-card lg:hidden"
      >
        <SlidersHorizontal className="size-4" /> Filtrar
        {activeCount ? <span className="rounded-full bg-ink px-1.5 text-[11px] text-white tabular-nums">{activeCount}</span> : null}
      </button>
      <div id="history-filters" className={cn(open ? "mt-3 block" : "hidden", "lg:mt-0 lg:block")}>
        {children}
      </div>
    </div>
  );
}
