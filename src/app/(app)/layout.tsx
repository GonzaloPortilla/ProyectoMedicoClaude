import { Logo } from "@/components/logo";
import { NAV_SECTIONS } from "@/components/shell/nav-config";
import { MobileNav, SidebarNav } from "@/components/shell/nav-links";
import { Avatar, LogoutButton, UserCard } from "@/components/shell/user-card";
import { requireUser } from "@/server/auth/dal";
import { hasRole } from "@/server/auth/roles";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Todo lo que está bajo (app) requiere sesión válida (verificada contra la base).
  const user = await requireUser();
  const sections = NAV_SECTIONS.filter((s) => hasRole(user.roles, s.role));

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
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
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 px-4 pt-3 pb-2.5 backdrop-blur-xl lg:hidden">
        <div className="mb-2.5 flex items-center justify-between">
          <Logo href="/dashboard" />
          <div className="flex items-center gap-1">
            <Avatar user={user} className="size-8 text-xs" />
            <LogoutButton compact />
          </div>
        </div>
        <MobileNav sections={sections} />
      </header>

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
