import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Download, ExternalLink, FileText, LineChart, ScanText, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SourceBadge } from "@/components/status/source-badge";
import { CategoryIcon } from "@/features/records/components/category-icon";
import { DeleteRecordButton } from "@/features/records/components/delete-record-button";
import { ReportView } from "@/features/access/components/report-view";
import { getRecord } from "@/server/medical/records";
import { getReviewData } from "@/server/documents/review";
import { analyzeRecordAction } from "@/features/documents/actions";
import { MeasurementList } from "@/features/documents/components/measurement-list";
import { loadConcepts } from "@/server/documents/concepts-store";
import { requirePatient } from "@/server/patient/context";
import { signedFileUrl } from "@/server/files/urls";
import { formatBytes } from "@/lib/text";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Estudio" };

export default async function RecordDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ recordId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, patientId } = await requirePatient();
  const [{ recordId }, { created }] = await Promise.all([params, searchParams]);
  // Filtra por el patientId de la sesión: el registro de otro paciente responde 404.
  const record = await getRecord(patientId, recordId);
  if (!record) notFound();
  const [analysis, concepts] = await Promise.all([getReviewData(patientId, record.id), loadConcepts()]);
  const extraction = analysis?.extraction ?? null;
  const measurements = (analysis?.record.measurements ?? []).filter((m) => m.reviewStatus !== "DISCARDED");
  const pending = measurements.filter((m) => m.reviewStatus === "PENDING").length;
  const confirmed = measurements.filter((m) => m.reviewStatus === "CONFIRMED");
  const ownUpload = record.source === "PATIENT" && !record.report;
  const status = extraction?.status ?? null;
  const reviewHref = `/patient/documents/${record.id}/review`;

  const details = [
    ["Fecha", formatDate(record.occurredOn)],
    ["Categoría", record.category.name],
    ["Especialidad", record.specialty],
    ["Institución", record.institution?.name],
    ["Profesional", record.professionalName],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1">
            <Link href="/patient/documents" className="hover:text-ink">
              Mis estudios
            </Link>
            <ChevronRight className="size-3.5" /> Detalle
          </span>
        }
        title={record.title}
        action={record.source === "PATIENT" && !record.report ? <DeleteRecordButton recordId={record.id} title={record.title} /> : undefined}
      />
      {created === "1" ? (
        <Alert tone="success" className="mb-5">
          Guardado. Ya forma parte de tu historial.{status === "UPLOADED" || status === "PROCESSING" ? " Estamos leyendo el documento para buscar resultados." : ""}
        </Alert>
      ) : null}

      {status === "UPLOADED" || status === "PROCESSING" ? (
        <div className="mb-5 flex flex-col gap-3 rounded-2xl bg-sky-50 p-4 text-sm text-sky-900 ring-1 ring-sky-200/70 ring-inset sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <ScanText className="size-4 shrink-0" aria-hidden /> Analizando el documento…
          </p>
          <ButtonLink href={reviewHref} size="sm" variant="secondary">
            Ver el progreso
          </ButtonLink>
        </div>
      ) : status === "READY_FOR_REVIEW" && ownUpload ? (
        <div className="mb-5 flex flex-col gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200/70 ring-inset sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <Sparkles className="size-4 shrink-0" aria-hidden />
            {extraction && !extraction.metadataReviewed ? "Detectamos los datos de este estudio" : "Hay resultados detectados"}
            {pending ? ` y ${pending === 1 ? "1 resultado" : `${pending} resultados`} para revisar` : ""}.
          </p>
          <ButtonLink href={reviewHref} size="sm">
            Revisar
          </ButtonLink>
        </div>
      ) : null}

      {record.report ? (
        <div className="mb-5">
          <ReportView report={record.report} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card>
          <div className="flex items-center gap-3 px-5 pt-5 sm:px-6">
            <CategoryIcon slug={record.category.slug} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{record.category.name}</p>
              <p className="text-[13px] text-muted">{formatDate(record.occurredOn)}</p>
            </div>
          </div>
          <CardBody>
            <dl className="divide-y divide-line">
              {details.map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5 py-2.5 first:pt-0 sm:flex-row sm:gap-3">
                  <dt className="shrink-0 text-sm text-muted sm:w-32">{label}</dt>
                  <dd className="min-w-0 text-sm font-medium break-words text-ink">{value}</dd>
                </div>
              ))}
              <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                <dt className="shrink-0 text-sm text-muted sm:w-32">Origen</dt>
                <dd className="flex flex-wrap items-center gap-2 text-sm text-ink">
                  <SourceBadge source={record.source} long />
                  <span className="text-[13px] text-muted">el {formatDate(record.createdAt)}</span>
                </dd>
              </div>
            </dl>
            {record.description ? <p className="mt-4 rounded-xl bg-canvas/70 p-3.5 text-sm leading-relaxed break-words whitespace-pre-line text-ink-soft">{record.description}</p> : null}
            {record.tags.length ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {record.tags.map((t) => (
                  <Link key={t} href={`/patient/search?q=${encodeURIComponent(t)}`}>
                    <Badge>#{t}</Badge>
                  </Link>
                ))}
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Archivos" description={record.files.length ? "Se abren de forma privada; el enlace sólo funciona con tu sesión." : undefined} />
          <CardBody>
            {record.files.length === 0 ? (
              <p className="text-sm text-muted">Este registro no tiene archivos adjuntos.</p>
            ) : (
              <ul className="space-y-4">
                {record.files.map((f) => {
                  // Enlaces temporales firmados (10 min) atados a este usuario.
                  const url = signedFileUrl(user.id, f.id);
                  const downloadUrl = signedFileUrl(user.id, f.id, "attachment");
                  const isImage = f.mimeType.startsWith("image/");
                  return (
                    <li key={f.id} className="space-y-3">
                      {isImage ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
                          {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido con validación de sesión */}
                          <img src={url} alt={f.originalName} className="max-h-[420px] w-full object-contain" />
                        </a>
                      ) : null}
                      <div className="flex items-center gap-3 rounded-xl border border-line p-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 ring-inset">
                          <FileText className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{f.originalName}</p>
                          <p className="text-xs text-muted">
                            {f.mimeType === "application/pdf" ? "PDF" : f.mimeType.replace("image/", "").toUpperCase()} · {formatBytes(f.sizeBytes)}
                          </p>
                        </div>
                        <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "sm" })} aria-label={`Ver ${f.originalName}`}>
                          <ExternalLink className="size-3.5" /> <span className="hidden sm:inline">Ver</span>
                        </a>
                        <a href={downloadUrl} className={buttonClasses({ variant: "ghost", size: "sm" })} aria-label={`Descargar ${f.originalName}`}>
                          <Download className="size-3.5" />
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {measurements.length ? (
        <Card id="resultados" className="mt-5 scroll-mt-24">
          <CardHeader
            title={`Resultados (${measurements.length})`}
            description={confirmed.length ? `${confirmed.length} confirmados${pending ? ` · ${pending} sin confirmar` : ""}. Cada dato muestra de dónde salió.` : "Todavía no confirmaste estos resultados."}
            action={
              <div className="flex flex-wrap gap-2">
                {pending && ownUpload ? (
                  <ButtonLink href={reviewHref} size="sm">
                    Revisar
                  </ButtonLink>
                ) : null}
                {confirmed.length ? (
                  <ButtonLink href={`/patient/evolution?i=${encodeURIComponent(confirmed[0]!.normalizedKey)}`} size="sm" variant="secondary">
                    <LineChart className="size-3.5" /> Evolución
                  </ButtonLink>
                ) : null}
              </div>
            }
          />
          <CardBody>
            <MeasurementList recordId={record.id} measurements={measurements} source={{ title: record.title, institution: record.institution?.name ?? null, date: record.occurredOn }} concepts={concepts} editable={false} back="record" />
          </CardBody>
        </Card>
      ) : null}

      {ownUpload && record.files.length && (!extraction || status === "FAILED") ? (
        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-dashed border-line-strong p-4 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>{status === "FAILED" ? "No pudimos leer este documento automáticamente. El archivo original está intacto." : "¿Querés que leamos este documento para buscar resultados de laboratorio?"}</p>
          <form action={analyzeRecordAction}>
            <input type="hidden" name="recordId" value={record.id} />
            <Button type="submit" size="sm" variant="secondary">
              <ScanText className="size-3.5" /> {status === "FAILED" ? "Reintentar análisis" : "Analizar documento"}
            </Button>
          </form>
        </div>
      ) : null}
    </>
  );
}
