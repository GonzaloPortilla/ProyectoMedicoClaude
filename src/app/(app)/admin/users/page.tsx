import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { VerificationBadge } from "@/components/status/verification-badge";
import { Avatar } from "@/components/shell/user-card";
import { listUsers } from "@/features/admin/queries";
import { formatDate, fullName } from "@/lib/utils";
import { requireRole } from "@/server/auth/dal";
import { ROLE_LABELS, sortRoles } from "@/server/auth/roles";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Usuarios" };

const paramsSchema = z.object({
  q: z.string().max(100).optional().catch(undefined),
  role: z.enum(["PATIENT", "DOCTOR", "ADMIN"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});

const ROLE_FILTERS = [
  { value: undefined, label: "Todos" },
  { value: "PATIENT", label: "Pacientes" },
  { value: "DOCTOR", label: "Médicos" },
  { value: "ADMIN", label: "Administradores" },
] as const;

const ROLE_TONES = { PATIENT: "blue", DOCTOR: "violet", ADMIN: "neutral" } as const;

function buildHref(params: { q?: string; role?: string; page?: number }) {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.role) sp.set("role", params.role);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const s = sp.toString();
  return s ? `/admin/users?${s}` : "/admin/users";
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole("ADMIN");
  const params = paramsSchema.parse(await searchParams);
  const { users, total, page, pageCount } = await listUsers({ query: params.q, role: params.role, page: params.page });

  return (
    <>
      <PageHeader eyebrow="Administración" title="Usuarios" description={`${total} ${total === 1 ? "cuenta registrada" : "cuentas registradas"}`} />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0">
          <div className="inline-flex rounded-xl bg-ink/[0.05] p-1">
            {ROLE_FILTERS.map((f) => {
              const active = params.role === f.value;
              return (
                <Link
                  key={f.label}
                  href={buildHref({ q: params.q, role: f.value })}
                  aria-current={active ? "true" : undefined}
                  className={cn("rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors", active ? "bg-surface text-ink shadow-card" : "text-ink-soft hover:text-ink")}
                >
                  {f.label}
                </Link>
              );
            })}
          </div>
        </div>
        <form className="flex gap-2" role="search">
          {params.role ? <input type="hidden" name="role" value={params.role} /> : null}
          <div className="relative flex-1 lg:w-72">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              name="q"
              defaultValue={params.q}
              placeholder="Buscar por nombre o email"
              aria-label="Buscar usuarios"
              className="h-10 w-full rounded-xl border border-line-strong bg-surface pr-3 pl-9 text-sm shadow-card placeholder:text-muted/70 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none"
            />
          </div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
      </div>

      <Card className="overflow-hidden">
        {users.length === 0 ? (
          <p className="px-6 py-16 text-center text-sm text-muted">No se encontraron usuarios.</p>
        ) : (
          <>
            {/* Tabla (desktop) */}
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="border-b border-line bg-canvas/60 text-xs text-muted">
                <tr>
                  <th className="px-6 py-3 font-medium">Usuario</th>
                  <th className="px-4 py-3 font-medium">Roles</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Alta</th>
                  <th className="px-6 py-3 font-medium">Último ingreso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-canvas/50">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar user={u} className="size-8 text-xs" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{fullName(u)}</p>
                          <p className="truncate text-xs text-muted">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        {sortRoles(u.roles.map((r) => r.role)).map((r) => (
                          <Badge key={r} tone={ROLE_TONES[r]}>
                            {ROLE_LABELS[r]}
                          </Badge>
                        ))}
                        {u.doctorProfile ? <VerificationBadge status={u.doctorProfile.verificationStatus} /> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">{u.status === "ACTIVE" ? <span className="text-ink-soft">Activo</span> : <Badge tone="red">Suspendido</Badge>}</td>
                    <td className="px-4 py-3.5 text-ink-soft tabular-nums">{formatDate(u.createdAt)}</td>
                    <td className="px-6 py-3.5 text-ink-soft tabular-nums">{formatDate(u.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Lista (mobile) */}
            <ul className="divide-y divide-line md:hidden">
              {users.map((u) => (
                <li key={u.id} className="flex items-start gap-3 px-4 py-4">
                  <Avatar user={u} className="size-9 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{fullName(u)}</p>
                    <p className="truncate text-xs text-muted">{u.email}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {sortRoles(u.roles.map((r) => r.role)).map((r) => (
                        <Badge key={r} tone={ROLE_TONES[r]}>
                          {ROLE_LABELS[r]}
                        </Badge>
                      ))}
                      {u.doctorProfile ? <VerificationBadge status={u.doctorProfile.verificationStatus} /> : null}
                      {u.status !== "ACTIVE" ? <Badge tone="red">Suspendido</Badge> : null}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted tabular-nums">{formatDate(u.createdAt)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {pageCount > 1 ? (
        <nav aria-label="Paginación" className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">
            Página {page} de {pageCount}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={buildHref({ ...params, page: page - 1 })} className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 font-medium shadow-card hover:bg-canvas">
                Anterior
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link href={buildHref({ ...params, page: page + 1 })} className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 font-medium shadow-card hover:bg-canvas">
                Siguiente
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}
