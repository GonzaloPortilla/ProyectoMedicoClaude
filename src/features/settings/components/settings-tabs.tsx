"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings", label: "Datos personales" },
  { href: "/settings/security", label: "Seguridad" },
  { href: "/settings/privacy", label: "Privacidad" },
  { href: "/settings/activity", label: "Actividad" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones de configuración" className="-mx-4 mb-6 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      <div className="inline-flex rounded-xl bg-ink/[0.05] p-1">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn("rounded-lg px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors", active ? "bg-surface text-ink shadow-card" : "text-ink-soft hover:text-ink")}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
