import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Paperclip, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CategoryIcon } from "@/features/records/components/category-icon";
import { listRecords } from "@/server/medical/records";
import { requirePatient } from "@/server/patient/context";
import { formatDate, joinUnique } from "@/lib/utils";

export const metadata: Metadata = { title: "Mis estudios" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { patientId } = await requirePatient();
  const [records, { deleted }] = await Promise.all([listRecords(patientId), searchParams]);

  return (
    <>
      <PageHeader
        eyebrow="Paciente"
        title="Mis estudios"
        description="Análisis, imágenes, informes y recetas. Sólo vos podés verlos."
        action={
          <ButtonLink href="/patient/documents/new">
            <Plus className="size-4" /> Subir estudio
          </ButtonLink>
        }
      />
      {deleted === "1" ? (
        <Alert tone="success" className="mb-5">
          El registro y sus archivos se eliminaron.
        </Alert>
      ) : null}

      {records.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-canvas text-muted ring-1 ring-line ring-inset">
            <FileText className="size-5" />
          </span>
          <p className="mt-4 font-medium text-ink">Todavía no subiste estudios</p>
          <p className="mt-1 max-w-sm text-sm text-muted">Subí un PDF o una foto de tu último análisis. Lleva menos de un minuto.</p>
          <ButtonLink href="/patient/documents/new" className="mt-6">
            <Plus className="size-4" /> Subir mi primer estudio
          </ButtonLink>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {records.map((r) => (
              <li key={r.id}>
                <Link href={`/patient/documents/${r.id}`} className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-canvas/60 sm:px-6">
                  <CategoryIcon slug={r.category.slug} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{r.title}</p>
                    <p className="truncate text-[13px] text-muted">{joinUnique([r.category.name, r.specialty, r.institution?.name])}</p>
                    {r.tags.length ? (
                      <div className="mt-1.5 hidden flex-wrap gap-1 sm:flex">
                        {r.tags.slice(0, 4).map((t) => (
                          <Badge key={t}>#{t}</Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[13px] text-ink-soft tabular-nums">{formatDate(r.occurredOn)}</span>
                    {r.files.length ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted">
                        <Paperclip className="size-3" /> {r.files.length}
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
