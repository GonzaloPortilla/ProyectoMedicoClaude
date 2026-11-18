import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ExternalLink, FlaskConical, Paperclip, Plus, ScanText, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { signedFileUrl } from "@/server/files/urls";
import { PageHeader } from "@/components/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SourceBadge } from "@/components/status/source-badge";
import { CategoryIcon } from "@/features/records/components/category-icon";
import { FiltersPanel } from "@/features/records/components/filters-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { timelineFiltersSchema } from "@/features/records/schemas";
import { getTimeline, getTimelineFilterOptions, type TimelineItem } from "@/server/medical/timeline";
import { requirePatient } from "@/server/patient/context";
import { joinUnique } from "@/lib/utils";

export const metadata: Metadata = { title: "Historial" };

const dayMonth = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const cardDate = (d: Date) => dayMonth.format(d).replace(/\./g, "").replace(/ de /g, " ");

function groupByYear(items: TimelineItem[]) {
  const groups = new Map<number, TimelineItem[]>();
  for (const item of items) {
    const year = item.date.getUTCFullYear();
    groups.set(year, [...(groups.get(year) ?? []), item]);
  }
  return [...groups.entries()];
}

const selectCls =
  "h-10 w-full appearance-none rounded-xl border border-line-strong bg-surface bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22><path d=%22M6 8l4 4 4-4%22 fill=%22none%22 stroke=%22%236b7486%22 stroke-width=%221.6%22/></svg>')] bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9 pl-3 text-sm shadow-card focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, patientId } = await requirePatient();
  const filters = timelineFiltersSchema.parse(await searchParams);
  const [items, options] = await Promise.all([getTimeline(patientId, filters), getTimelineFilterOptions(patientId)]);
  const hasFilters = !!(filters.year || filters.category || filters.specialty || filters.institution);
  const groups = groupByYear(items);

  return (
    <>
      <PageHeader
       
        title="Historial"
        description="Tu historia médica en orden cronológico."
        action={
          <ButtonLink href="/patient/documents/new" variant="secondary">
            <Plus className="size-4" /> Agregar
          </ButtonLink>
        }
      />

      <FiltersPanel activeCount={[filters.year, filters.category, filters.specialty, filters.institution].filter(Boolean).length}>
      <form className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]" aria-label="Filtros del historial">
        <select name="year" defaultValue={filters.year ?? ""} aria-label="Año" className={selectCls}>
          <option value="">Todos los años</option>
          {options.years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={filters.category ?? ""} aria-label="Categoría" className={selectCls}>
          <option value="">Todas las categorías</option>
          {options.categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="specialty" defaultValue={filters.specialty ?? ""} aria-label="Especialidad" className={selectCls}>
          <option value="">Todas las especialidades</option>
          {options.specialties.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select name="institution" defaultValue={filters.institution ?? ""} aria-label="Institución" className={selectCls}>
          <option value="">Todas las instituciones</option>
          {options.institutions.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
          <Button type="submit" variant="secondary" className="flex-1 lg:flex-none">
            Filtrar
          </Button>
          {hasFilters ? (
            <ButtonLink href="/patient/history" variant="ghost">
              Limpiar
            </ButtonLink>
          ) : null}
        </div>
      </form>
      </FiltersPanel>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title={hasFilters ? "No hay resultados con estos filtros" : "Tu historial está vacío"}
            description={hasFilters ? "Probá con otros filtros o limpialos para ver todo." : "Subí un estudio o cargá cirugías, internaciones y vacunas en Mi salud para verlos acá, ordenados por fecha."}
            action={
              hasFilters ? (
                <ButtonLink href="/patient/history" variant="secondary" size="sm">
                  Limpiar filtros
                </ButtonLink>
              ) : (
                <ButtonLink href="/patient/documents/new" size="sm">
                  <Plus className="size-4" /> Subir un estudio
                </ButtonLink>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-10">
          {groups.map(([year, yearItems]) => (
            <section key={year} aria-labelledby={`year-${year}`}>
              <h2 id={`year-${year}`} className="sticky top-[104px] z-10 mb-3 bg-canvas/90 py-1 text-2xl font-semibold tracking-tight text-ink backdrop-blur lg:top-0">
                {year}
              </h2>
              <ol className="relative ml-[19px] border-l border-line-strong/70 sm:ml-[23px]">
                {yearItems.map((item) => {
                  const results =
                    item.processing === "UPLOADED" || item.processing === "PROCESSING" ? (
                      <Badge tone="blue">
                        <ScanText className="size-3" aria-hidden /> Analizando…
                      </Badge>
                    ) : item.pendingCount ? (
                      <Badge tone="amber">
                        <Sparkles className="size-3" aria-hidden /> {item.resultCount === 1 ? "1 resultado detectado" : `${item.resultCount} resultados detectados`} · por revisar
                      </Badge>
                    ) : item.processing === "READY_FOR_REVIEW" ? (
                      <Badge tone="amber">
                        <Sparkles className="size-3" aria-hidden /> Datos por revisar
                      </Badge>
                    ) : item.resultCount ? (
                      <Badge tone="brand">
                        <FlaskConical className="size-3" aria-hidden /> {item.resultCount === 1 ? "1 resultado" : `${item.resultCount} resultados`}
                      </Badge>
                    ) : null;
                  const reviewHref = item.kind === "record" ? `/patient/documents/${item.key.slice("record:".length)}/review` : null;
                  return (
                    <li key={item.key} className="relative pb-4 pl-8 last:pb-0 sm:pl-10">
                      <span className="absolute top-3 -left-[19px] sm:-left-[23px]">
                        <CategoryIcon slug={item.categorySlug} className="size-[38px] bg-surface sm:size-[46px]" />
                      </span>
                      <div className={`relative rounded-2xl border border-line bg-surface p-4 shadow-card ${item.href ? "transition-shadow hover:shadow-raised" : ""}`}>
                        <p className="text-xs font-semibold tracking-wide text-muted uppercase">{cardDate(item.date)}</p>
                        <p className="mt-0.5 font-medium break-words text-ink">
                          {item.href ? (
                            // Enlace "estirado": toda la tarjeta abre el detalle; los botones quedan por encima.
                            <Link href={item.href} className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand-500">
                              {item.title}
                            </Link>
                          ) : (
                            item.title
                          )}
                        </p>
                        <p className="mt-0.5 text-[13px] break-words text-muted">{joinUnique([item.institution, item.categoryName, item.specialty, item.professional])}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {results}
                          {item.fileCount ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted">
                              <Paperclip className="size-3" /> {item.fileCount === 1 ? "1 archivo" : `${item.fileCount} archivos`}
                            </span>
                          ) : null}
                          {item.source !== "PATIENT" ? <SourceBadge source={item.source} /> : null}
                        </div>
                        {item.kind === "record" && (item.resultCount || item.firstFileId || item.processing === "READY_FOR_REVIEW") ? (
                          <div className="relative z-10 mt-3 flex flex-wrap gap-2">
                            {item.pendingCount || item.processing === "READY_FOR_REVIEW" ? (
                              <Link href={reviewHref!} className={buttonClasses({ size: "sm" })}>
                                Revisar
                              </Link>
                            ) : item.resultCount ? (
                              <Link href={`${item.href}#resultados`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                                Ver resultados
                              </Link>
                            ) : null}
                            {item.firstFileId ? (
                              <a href={signedFileUrl(user.id, item.firstFileId)} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "ghost", size: "sm" })}>
                                <ExternalLink className="size-3.5" /> Ver documento
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
