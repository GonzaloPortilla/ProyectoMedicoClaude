import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Copy, FlaskConical, RefreshCw, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { analyzeRecordAction } from "@/features/documents/actions";
import { DetailsForm, type DetailsDefaults } from "@/features/documents/components/details-form";
import { BulkActions, MeasurementList } from "@/features/documents/components/measurement-list";
import { OriginalDocument } from "@/features/documents/components/original-document";
import { ProcessingWatcher } from "@/features/documents/components/processing-watcher";
import { EXTRACTION_ERRORS, methodLabel } from "@/features/documents/format";
import { getReviewData } from "@/server/documents/review";
import { loadConcepts } from "@/server/documents/concepts-store";
import { listActiveCategories } from "@/server/medical/records";
import { requirePatient } from "@/server/patient/context";
import { db } from "@/server/db";
import { formatDate } from "@/lib/utils";
import { toDateInput } from "@/lib/text";

export const metadata: Metadata = { title: "Revisar estudio" };

const NOTICES: Record<string, string> = {
  details: "Datos del estudio confirmados.",
  confirmed: "Resultados confirmados. Ya aparecen en Evolución.",
  discarded: "Resultados descartados. No se borró nada: podés restaurarlos cuando quieras.",
  pending: "El resultado volvió a quedar sin confirmar.",
};

export default async function ReviewDocumentPage({ params, searchParams }: { params: Promise<{ recordId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, patientId } = await requirePatient();
  const [{ recordId }, { saved }] = await Promise.all([params, searchParams]);
  // Filtra por el paciente de la sesión: el estudio de otro paciente responde 404.
  const data = await getReviewData(patientId, recordId);
  if (!data) notFound();
  const { record, extraction, duplicates } = data;
  const [categories, institutions, concepts] = await Promise.all([
    listActiveCategories(),
    db.institution.findMany({ where: { patientId }, orderBy: { name: "asc" }, select: { name: true } }),
    loadConcepts(),
  ]);

  const file = record.files[0] ?? null;
  const status = extraction?.status ?? null;
  const processing = status === "UPLOADED" || status === "PROCESSING";
  const s = extraction?.suggestions ?? null;
  const editable = record.source === "PATIENT" && !record.report;
  const needsDetails = editable && !!extraction && !extraction.metadataReviewed && !processing;
  const pending = record.measurements.filter((m) => m.reviewStatus === "PENDING").length;
  const notice = typeof saved === "string" ? NOTICES[saved] : undefined;

  const pick = (sug: { value: string } | null | undefined, current: string | null | undefined) =>
    needsDetails && sug?.value && status !== "FAILED" ? { value: sug.value, detected: true } : { value: current ?? "", detected: false };
  const defaults: DetailsDefaults = {
    title: pick(s?.title, record.title),
    occurredOn: pick(s?.occurredOn, toDateInput(record.occurredOn)),
    categorySlug: pick(s?.categorySlug, record.category.slug),
    specialty: pick(s?.specialty, record.specialty),
    institution: pick(s?.institution, record.institution?.name),
    professionalName: pick(s?.professional, record.professionalName),
  };
  // Mientras los datos no estén confirmados, la procedencia muestra lo detectado (no los datos provisorios).
  const source = needsDetails && status !== "FAILED"
    ? { title: defaults.title.value || record.title, institution: defaults.institution.value || null, date: defaults.occurredOn.value ? new Date(`${defaults.occurredOn.value}T00:00:00Z`) : record.occurredOn }
    : { title: record.title, institution: record.institution?.name ?? null, date: record.occurredOn };

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1">
            <Link href="/patient/documents" className="hover:text-ink">
              Mis estudios
            </Link>
            <ChevronRight className="size-3.5" /> Revisión
          </span>
        }
        title={needsDetails ? "Revisá tu estudio" : record.title}
        description={needsDetails ? "Lo guardamos y leímos su contenido. Confirmá los datos para que quede bien ordenado en tu historial." : `${record.category.name} · ${formatDate(record.occurredOn)}`}
        action={
          <ButtonLink href={`/patient/documents/${record.id}`} variant="ghost">
            Ir al estudio
          </ButtonLink>
        }
      />

      {notice ? (
        <Alert tone="success" className="mb-5">
          {notice}
        </Alert>
      ) : null}

      {!extraction ? (
        <Alert tone="info" className="mb-5">
          Este estudio no tiene un análisis automático.{" "}
          {file && editable ? (
            <form action={analyzeRecordAction} className="inline">
              <input type="hidden" name="recordId" value={record.id} />
              <button type="submit" className="font-medium underline underline-offset-2">
                Analizarlo ahora
              </button>
            </form>
          ) : null}
        </Alert>
      ) : null}

      {processing ? (
        <Card className="mb-5">
          <CardBody className="flex items-start gap-4 sm:p-6">
            <span aria-hidden className="mt-1 size-5 shrink-0 animate-spin rounded-full border-2 border-brand-600 border-r-transparent" />
            <div className="space-y-1" role="status" aria-live="polite">
              <p className="font-medium text-ink">Analizando el documento…</p>
              <p className="text-sm text-muted">Estamos leyendo el texto y buscando resultados. Suele tardar unos segundos (las fotos y los PDF escaneados, un poco más).</p>
              <p className="text-sm text-muted">Podés salir de esta página: el estudio ya está guardado.</p>
              <ProcessingWatcher />
            </div>
          </CardBody>
        </Card>
      ) : null}

      {status === "FAILED" ? (
        <Alert tone="info" className="mb-5">
          <p className="font-medium">No pudimos leer el contenido automáticamente.</p>
          <p className="mt-0.5">
            {EXTRACTION_ERRORS[extraction?.errorCode ?? ""] ?? EXTRACTION_ERRORS.INTERNAL_ERROR} El estudio quedó guardado y funciona como siempre
            {needsDetails ? "; completá sus datos acá abajo." : "."}
          </p>
          {editable ? (
            <form action={analyzeRecordAction} className="mt-2">
              <input type="hidden" name="recordId" value={record.id} />
              <Button type="submit" size="sm" variant="secondary">
                <RefreshCw className="size-3.5" /> Reintentar análisis
              </Button>
            </form>
          ) : null}
        </Alert>
      ) : null}

      {duplicates.length ? (
        <div role="status" className="mb-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200/70 ring-inset">
          <p className="flex items-center gap-2 font-medium">
            <Copy className="size-4" aria-hidden /> {duplicates.some((d) => d.reason === "same_file") ? "Este archivo parece estar cargado anteriormente." : "Puede que este estudio ya esté cargado."}
          </p>
          <ul className="mt-1.5 space-y-1">
            {duplicates.map((d) => (
              <li key={d.recordId}>
                <Link href={`/patient/documents/${d.recordId}`} className="underline underline-offset-2">
                  {d.title} · {formatDate(d.occurredOn)}
                </Link>
                {d.reason === "same_file" ? " (mismo archivo)" : " (misma fecha y datos parecidos)"}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[13px] text-amber-900/80">No se borra nada automáticamente. Si es un duplicado, podés eliminar uno de los dos desde su detalle.</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          {needsDetails ? (
            <Card>
              <CardHeader title="Datos del estudio" />
              <CardBody>
                {status !== "FAILED" ? (
                  <p className="mb-4 flex items-start gap-2 rounded-xl bg-brand-50/70 p-3 text-sm text-brand-900 ring-1 ring-brand-100 ring-inset">
                    <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                    Información detectada automáticamente. Revisala antes de confirmar.
                  </p>
                ) : null}
                <DetailsForm recordId={record.id} defaults={defaults} categories={categories} institutions={institutions.map((i) => i.name)} />
              </CardBody>
            </Card>
          ) : null}

          {extraction && !processing && status !== "FAILED" ? (
            <Card id="resultados" className="scroll-mt-24">
              <CardHeader
                title={record.measurements.length ? `Resultados encontrados (${record.measurements.length})` : "Resultados"}
                description={record.measurements.length ? "Confirmá cada resultado o corregilo. Sólo los confirmados pasan a Evolución." : undefined}
              />
              <CardBody>
                {editable && pending ? (
                  <div className="mb-2 border-b border-line pb-4">
                    <BulkActions recordId={record.id} pending={pending} />
                  </div>
                ) : null}
                {record.measurements.length ? (
                  <MeasurementList recordId={record.id} measurements={record.measurements} source={source} concepts={concepts} editable={editable} />
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted">
                    <FlaskConical className="size-4" aria-hidden /> No encontramos resultados de laboratorio en este documento. El estudio queda guardado igual.
                  </p>
                )}
                {record.measurements.length ? (
                  <p className="mt-4 border-t border-line pt-4 text-xs text-muted">
                    Los rangos de referencia los informa cada laboratorio y pueden variar según la metodología. Vitalia no interpreta los resultados: ante cualquier duda, consultalo con tu médico.
                  </p>
                ) : null}
              </CardBody>
            </Card>
          ) : null}
        </div>

        {/* En el celular el original va primero: siempre a la vista mientras se revisa. */}
        <div className="order-first min-w-0 space-y-5 lg:sticky lg:top-6 lg:order-none lg:self-start">
          {file ? (
            <Card>
              <CardHeader title="Documento original" />
              <CardBody>
                <OriginalDocument userId={user.id} file={file} />
                {extraction?.method ? (
                  <p className="mt-3 text-xs text-muted">
                    {methodLabel(extraction.method)}
                    {extraction.method === "OCR" && extraction.ocrConfidence !== null ? ` · nitidez de lectura ${Math.round(extraction.ocrConfidence)}%` : ""}
                    {extraction.pageCount ? ` · ${extraction.pageCount === 1 ? "1 página" : `${extraction.pageCount} páginas`}` : ""}.
                  </p>
                ) : null}
              </CardBody>
            </Card>
          ) : null}
          {extraction?.text ? (
            <Card>
              <details>
                <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-ink sm:px-6">Ver texto extraído</summary>
                <pre className="max-h-80 overflow-auto border-t border-line px-5 py-4 font-sans text-xs leading-relaxed break-words whitespace-pre-wrap text-ink-soft sm:px-6">{extraction.text.slice(0, 20000)}</pre>
              </details>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
