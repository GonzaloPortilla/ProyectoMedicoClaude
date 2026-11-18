"use client";

import { useRouter } from "next/navigation";

/** Selector de indicador para pantallas chicas (en escritorio se usa la lista lateral). */
export function IndicatorSelect({ options, selected }: { options: { key: string; label: string; href: string }[]; selected: string }) {
  const router = useRouter();
  return (
    <div className="space-y-1.5">
      <label htmlFor="indicator" className="text-[13px] font-medium text-ink-soft">
        Indicador
      </label>
      <select
        id="indicator"
        value={selected}
        onChange={(e) => {
          const target = options.find((o) => o.key === e.target.value);
          if (target) router.push(target.href);
        }}
        className="block h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[15px] text-ink shadow-card focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
