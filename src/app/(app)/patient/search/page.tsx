import type { Metadata } from "next";
import Link from "next/link";
import { Paperclip, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CategoryIcon } from "@/features/records/components/category-icon";
import { searchPatientData } from "@/server/medical/search";
import { requirePatient } from "@/server/patient/context";
import { formatDate, joinUnique } from "@/lib/utils";

export const metadata: Metadata = { title: "Buscar" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { patientId } = await requirePatient();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.slice(0, 100) : "";
  const results = query ? await searchPatientData(patientId, query) : null;

  return (
    <>
      <PageHeader eyebrow="Paciente" title="Buscar" description="Encontrá estudios, médicos, instituciones, etiquetas y datos de salud." />

      <form role="search" className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            autoFocus
            maxLength={100}
            placeholder="Ej.: hemograma, cardiología, Hospital Italiano…"
            aria-label="Buscar en mi información"
            className="h-12 w-full rounded-2xl border border-line-strong bg-surface pr-4 pl-10 text-[15px] shadow-card placeholder:text-muted/70 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none"
          />
        </div>
        <Button type="submit" size="lg">
          Buscar
        </Button>
      </form>

      {!query ? (
        <p className="text-sm text-muted">Escribí al menos 2 letras. La búsqueda no distingue mayúsculas ni acentos.</p>
      ) : !results || results.total === 0 ? (
        <Card className="px-6 py-14 text-center">
          <p className="font-medium text-ink">Sin resultados para “{query}”</p>
          <p className="mt-1 text-sm text-muted">Probá con otra palabra o revisá la ortografía.</p>
        </Card>
      ) : (
        <div className="space-y-8">
          <p className="text-sm text-muted">
            {results.total} {results.total === 1 ? "resultado" : "resultados"} para “{results.query}”
          </p>
          {results.records.length ? (
            <section>
              <h2 className="mb-3 text-[15px] font-semibold tracking-tight text-ink">Estudios y registros</h2>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-line">
                  {results.records.map((r) => (
                    <li key={r.id}>
                      <Link href={`/patient/documents/${r.id}`} className="flex items-start gap-4 px-4 py-4 hover:bg-canvas/60 sm:px-6">
                        <CategoryIcon slug="file" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium break-words text-ink">{r.title}</p>
                          <p className="text-[13px] break-words text-muted">
                            {joinUnique([r.category.name, r.specialty, r.institution?.name, r.professionalName])}
                          </p>
                          {r.description ? <p className="mt-1 line-clamp-2 text-[13px] text-ink-soft">{r.description}</p> : null}
                          {r.tags.length ? (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {r.tags.map((t) => (
                                <Badge key={t}>#{t}</Badge>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-[13px] text-ink-soft tabular-nums">{formatDate(r.occurredOn)}</span>
                          {r._count.files ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted">
                              <Paperclip className="size-3" /> {r._count.files}
                            </span>
                          ) : null}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ) : null}
          {results.health.length ? (
            <section>
              <h2 className="mb-3 text-[15px] font-semibold tracking-tight text-ink">Mi salud</h2>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-line">
                  {results.health.map((h) => (
                    <li key={h.key}>
                      <Link href={`/patient/health#${h.anchor}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-canvas/60 sm:px-6">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium break-words text-ink">{h.title}</p>
                          {h.detail ? <p className="text-[13px] break-words text-muted">{h.detail}</p> : null}
                        </div>
                        <Badge>{h.section}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
