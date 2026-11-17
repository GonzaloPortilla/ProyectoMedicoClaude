import { LogOut } from "lucide-react";
import { logoutAction } from "@/features/auth/actions";
import type { CurrentUser } from "@/server/auth/dal";
import { ROLE_LABELS, sortRoles } from "@/server/auth/roles";
import { fullName, initials } from "@/lib/utils";

export function Avatar({ user, className = "size-9 text-[13px]" }: { user: Pick<CurrentUser, "firstName" | "lastName">; className?: string }) {
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-sky-100 font-semibold text-brand-900 ring-1 ring-brand-200/60 ${className}`}>
      {initials(user)}
    </span>
  );
}

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-ink/[0.05] hover:text-ink"
        aria-label="Cerrar sesión"
      >
        <LogOut className="size-4" />
        {compact ? null : <span>Salir</span>}
      </button>
    </form>
  );
}

export function UserCard({ user }: { user: CurrentUser }) {
  return (
    <div className="flex items-center gap-3 rounded-xl p-2">
      <Avatar user={user} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{fullName(user)}</p>
        <p className="truncate text-xs text-muted">{sortRoles(user.roles).map((r) => ROLE_LABELS[r]).join(" · ")}</p>
      </div>
      <LogoutButton compact />
    </div>
  );
}
