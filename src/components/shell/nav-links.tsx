"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BadgeCheck, CalendarClock, Settings, FileText, HeartPulse, House, LayoutDashboard, Search, Siren, Stethoscope, UserRound, UserRoundCheck, Users } from "lucide-react";
import type { NavIcon, NavItem, NavSection } from "@/components/shell/nav-config";
import { cn } from "@/lib/utils";

export const NAV_ICONS: Record<NavIcon, typeof House> = {
  home: House,
  profile: UserRound,
  doctor: Stethoscope,
  overview: LayoutDashboard,
  users: Users,
  verify: BadgeCheck,
  health: HeartPulse,
  documents: FileText,
  history: CalendarClock,
  emergency: Siren,
  search: Search,
  doctors: UserRoundCheck,
  activity: Activity,
  settings: Settings,
};

export function useIsActive() {
  const pathname = usePathname();
  return (item: NavItem) => {
    if (item.exclude?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
    return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
  };
}

export function SidebarNav({ sections }: { sections: NavSection[] }) {
  const isActive = useIsActive();
  return (
    <nav aria-label="Navegación principal" className="space-y-6">
      {sections.map((section) => (
        <div key={section.key}>
          {sections.length > 1 ? <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-muted uppercase">{section.title}</p> : null}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              const active = isActive(item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors",
                      active ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-ink-soft hover:bg-ink/[0.04] hover:text-ink",
                    )}
                  >
                    <Icon className={cn("size-4", active ? "text-brand-600" : "text-muted")} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
