import { Logo } from "@/components/logo";
import { NAV_SECTIONS } from "@/components/shell/nav-config";
import { SidebarNav } from "@/components/shell/nav-links";
import { MobileTabBar } from "@/components/shell/mobile-nav";
import { ROLE_LABELS, sortRoles } from "@/server/auth/roles";
import Link from "next/link";
import { Avatar, UserCard } from "@/components/shell/user-card";
import { requireUser } from "@/server/auth/dal";
import { hasRole } from "@/server/auth/roles";
import { fullName } from "@/lib/utils";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Todo lo que está bajo (app) requiere sesión válida (verificada contra la base).
  const user = await requireUser();
  const sections = NAV_SECTIONS.filter((s) => !s.role || hasRole(user.roles, s.role));

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-canvas px-3 py-5 lg:flex">
        <div className="px-3 pb-6">
          <Logo href="/dashboard" />
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav sections={sections} />
        </div>
        <div className="border-t border-line pt-3">
          <UserCard user={user} />
        </div>
      </aside>

      {/* Header (mobile) */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line/70 bg-canvas/85 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Logo href="/dashboard" />
        <Link href="/settings" aria-label="Configuración de la cuenta" className="rounded-full">
          <Avatar user={user} className="size-9 text-xs" />
        </Link>
      </header>

      <main id="contenido" tabIndex={-1} className="min-w-0 px-4 pt-6 pb-28 outline-none sm:px-6 lg:px-12 lg:py-12">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>

      <MobileTabBar sections={sections} userName={fullName(user)} userLabel={sortRoles(user.roles).map((r) => ROLE_LABELS[r]).join(" · ")} />
    </div>
  );
}
