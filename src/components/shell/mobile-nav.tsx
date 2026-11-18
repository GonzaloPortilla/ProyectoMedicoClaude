"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { LogOut, Menu, X } from "lucide-react";
import type { NavItem, NavSection } from "@/components/shell/nav-config";
import { NAV_ICONS, useIsActive } from "@/components/shell/nav-links";
import { logoutAction } from "@/features/auth/actions";
import { cn } from "@/lib/utils";

/**
 * Navegación móvil: barra inferior fija con las secciones principales (al alcance del pulgar)
 * y un botón "Más" que abre un panel con el resto, la cuenta y la salida.
 */
export function MobileTabBar({ sections, userName, userLabel }: { sections: NavSection[]; userName: string; userLabel: string }) {
  const isActive = useIsActive();
  const pathname = usePathname();
  const sheet = useRef<HTMLDialogElement>(null);
  const all = sections.flatMap((s) => s.items);
  const primary = all.filter((i) => i.primary).slice(0, 4);
  const rest = sections.map((s) => ({ ...s, items: s.items.filter((i) => !primary.includes(i)) })).filter((s) => s.items.length);
  const moreActive = rest.some((s) => s.items.some(isActive));

  // Al navegar, cerrar el panel.
  useEffect(() => {
    sheet.current?.close();
  }, [pathname]);

  const tab = (item: NavItem) => {
    const Icon = NAV_ICONS[item.icon];
    const active = isActive(item);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn("flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition-colors", active ? "text-ink" : "text-muted")}
      >
        <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-brand-50 text-brand-700")}>
          <Icon className="size-[19px]" />
        </span>
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-lg items-stretch gap-1 px-2 pt-1.5 pb-1">
          {primary.map(tab)}
          <button
            type="button"
            onClick={() => sheet.current?.showModal()}
            aria-haspopup="dialog"
            className={cn("flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium", moreActive ? "text-ink" : "text-muted")}
          >
            <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", moreActive && "bg-brand-50 text-brand-700")}>
              <Menu className="size-[19px]" />
            </span>
            Más
          </button>
        </div>
      </nav>

      <dialog
        ref={sheet}
        aria-label="Más opciones"
        className="mt-auto mb-0 w-full max-w-none rounded-t-[26px] border-0 bg-surface p-0 text-ink shadow-2xl backdrop:bg-ink/40 open:animate-[dialog-in_160ms_ease-out] lg:hidden"
        onClick={(e) => {
          if (e.target === sheet.current) sheet.current?.close();
        }}
      >
        <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/15" aria-hidden />
          <div className="mb-4 flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold">{userName}</p>
              <p className="truncate text-[13px] text-muted">{userLabel}</p>
            </div>
            <button type="button" onClick={() => sheet.current?.close()} className="flex size-9 items-center justify-center rounded-full bg-ink/[0.05]" aria-label="Cerrar">
              <X className="size-4" />
            </button>
          </div>
          {rest.map((section) => (
            <div key={section.key} className="mb-3">
              <p className="mb-1 px-2 text-[11px] font-semibold tracking-wider text-muted uppercase">{section.title}</p>
              <ul>
                {section.items.map((item) => {
                  const Icon = NAV_ICONS[item.icon];
                  const active = isActive(item);
                  return (
                    <li key={item.href}>
                      <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex h-12 items-center gap-3 rounded-xl px-2 text-[15px] font-medium", active ? "bg-canvas text-ink" : "text-ink-soft")}>
                        <Icon className={cn("size-5", active ? "text-brand-600" : "text-muted")} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <form action={logoutAction} className="border-t border-line pt-3">
            <button type="submit" className="flex h-12 w-full items-center gap-3 rounded-xl px-2 text-[15px] font-medium text-red-700">
              <LogOut className="size-5" /> Cerrar sesión
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
