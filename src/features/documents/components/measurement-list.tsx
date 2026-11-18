import { Check, CircleDashed, Pencil, RotateCcw, X } from "lucide-react";
import type { ExtractionMethod, MeasurementReviewStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { reviewMeasurementsAction } from "@/features/documents/actions";
import { MeasurementEditForm } from "@/features/documents/components/measurement-edit-form";
import { confidenceLabel, methodLabel, num, rangeNote, referenceLabel } from "@/features/documents/format";
import { formatDate, fullName } from "@/lib/utils";

type Dec = { toNumber(): number } | null;

export type MeasurementRowData = {
  id: string;
  originalName: string;
  valueText: string;
  valueNumeric: Dec;
  unit: string | null;
  refLow: Dec;
  refHigh: Dec;
  refText: string | null;
  documentFlag: string | null;
  measuredOn: Date;
  extractionMethod: ExtractionMethod;
  confidence: number | null;
  reviewStatus: MeasurementReviewStatus;
  detected: unknown;
  editedAt: Date | null;
  confirmedAt: Date | null;
  concept: { code: string; displayName: string } | null;
  confirmedBy: { firstName: string; lastName: string } | null;
};

export type SourceInfo = { title: string; institution: string | null; date: Date };

const STATUS: Record<MeasurementReviewStatus, { label: string; tone: "amber" | "brand" | "neutral" }> = {
  PENDING: { label: "Sin confirmar", tone: "amber" },
  CONFIRMED: { label: "Confirmado", tone: "brand" },
  DISCARDED: { label: "Descartado", tone: "neutral" },
};

/** ¿De dónde salió este dato? Documento, institución, fecha, método y quién lo confirmó. */
export function Provenance({ m, source }: { m: MeasurementRowData; source: SourceInfo }) {
  const detected = (m.detected ?? null) as { valueText?: string; unit?: string | null } | null;
  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-muted">
      <dt>Fuente</dt>
      <dd className="min-w-0 break-words text-ink-soft">
        {source.title}
        {source.institution ? ` · ${source.institution}` : ""} · {formatDate(source.date)}
      </dd>
      <dt>Origen</dt>
      <dd className="min-w-0 break-words">
        {methodLabel(m.extractionMethod)}
        {m.editedAt && detected?.valueText ? ` · corregido (se había leído «${detected.valueText}${detected.unit ? ` ${detected.unit}` : ""}»)` : ""}
      </dd>
      {m.reviewStatus === "CONFIRMED" && m.confirmedBy ? (
        <>
          <dt>Revisión</dt>
          <dd>
            Confirmado por {fullName(m.confirmedBy)}
            {m.confirmedAt ? ` el ${formatDate(m.confirmedAt)}` : ""}
          </dd>
        </>
      ) : null}
    </dl>
  );
}

function StatusForm({ recordId, ids, to, back, children, variant = "ghost", label }: { recordId: string; ids: string[]; to: MeasurementReviewStatus; back: "review" | "record"; children: React.ReactNode; variant?: "primary" | "secondary" | "ghost"; label: string }) {
  return (
    <form action={reviewMeasurementsAction}>
      <input type="hidden" name="recordId" value={recordId} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="back" value={back} />
      {ids.map((id) => (
        <input key={id} type="hidden" name="measurementId" value={id} />
      ))}
      <Button type="submit" size="sm" variant={variant} aria-label={label}>
        {children}
      </Button>
    </form>
  );
}

export function MeasurementList({
  recordId,
  measurements,
  source,
  concepts,
  editable,
  back = "review",
}: {
  recordId: string;
  measurements: MeasurementRowData[];
  source: SourceInfo;
  concepts: { code: string; displayName: string }[];
  editable: boolean;
  back?: "review" | "record";
}) {
  return (
    <ul className="divide-y divide-line">
      {measurements.map((m) => {
        const value = num(m.valueNumeric);
        const low = num(m.refLow);
        const high = num(m.refHigh);
        const ref = referenceLabel(low, high, m.unit, m.refText);
        const note = rangeNote(value, low, high, m.documentFlag);
        const name = m.concept?.displayName ?? m.originalName;
        const status = STATUS[m.reviewStatus];
        const conf = confidenceLabel(m.confidence);
        return (
          <li key={m.id} className={m.reviewStatus === "DISCARDED" ? "py-4 opacity-60" : "py-4"}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  {name}
                  <Badge tone={status.tone}>{status.label}</Badge>
                  {m.reviewStatus === "PENDING" ? <Badge tone={conf.tone}>{conf.label}</Badge> : null}
                </p>
                {m.concept && m.concept.displayName !== m.originalName ? <p className="text-xs text-muted">En el documento: «{m.originalName}»</p> : null}
                <p className="mt-1 text-xl font-semibold tracking-tight text-ink tabular-nums">
                  {m.valueText}
                  {m.unit ? <span className="ml-1 text-sm font-normal text-muted">{m.unit}</span> : null}
                </p>
                {ref ? <p className="text-[13px] text-muted">Referencia del laboratorio: {ref}</p> : null}
                {note ? <p className="mt-1 text-[13px] text-amber-800">{note}{m.documentFlag ? ` («${m.documentFlag}»)` : ""}</p> : null}
              </div>
              {editable ? (
                <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
                  {m.reviewStatus === "PENDING" ? (
                    <>
                      <StatusForm recordId={recordId} ids={[m.id]} to="CONFIRMED" back={back} variant="secondary" label={`Confirmar ${name}`}>
                        <Check className="size-3.5" /> Confirmar
                      </StatusForm>
                      <StatusForm recordId={recordId} ids={[m.id]} to="DISCARDED" back={back} label={`Descartar ${name}`}>
                        <X className="size-3.5" /> Descartar
                      </StatusForm>
                    </>
                  ) : m.reviewStatus === "CONFIRMED" ? (
                    <StatusForm recordId={recordId} ids={[m.id]} to="PENDING" back={back} label={`Marcar ${name} como sin confirmar`}>
                      <CircleDashed className="size-3.5" /> Quitar confirmación
                    </StatusForm>
                  ) : (
                    <StatusForm recordId={recordId} ids={[m.id]} to="PENDING" back={back} label={`Restaurar ${name}`}>
                      <RotateCcw className="size-3.5" /> Restaurar
                    </StatusForm>
                  )}
                </div>
              ) : null}
            </div>
            <Provenance m={m} source={source} />
            {editable && m.reviewStatus !== "DISCARDED" ? (
              <details className="group mt-2">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-medium text-brand-700 hover:bg-brand-50">
                  <Pencil className="size-3.5" aria-hidden /> Editar <span className="sr-only">{name}</span>
                </summary>
                <MeasurementEditForm
                  concepts={concepts}
                  m={{
                    id: m.id,
                    originalName: m.originalName,
                    conceptCode: m.concept?.code ?? "",
                    valueText: m.valueText,
                    unit: m.unit ?? "",
                    refLow: low !== null ? String(low).replace(".", ",") : "",
                    refHigh: high !== null ? String(high).replace(".", ",") : "",
                  }}
                />
              </details>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function BulkActions({ recordId, pending, back = "review" }: { recordId: string; pending: number; back?: "review" | "record" }) {
  if (!pending) return null;
  const form = (to: "CONFIRMED" | "DISCARDED", label: string, variant: "primary" | "ghost") => (
    <form action={reviewMeasurementsAction}>
      <input type="hidden" name="recordId" value={recordId} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="scope" value="all-pending" />
      <input type="hidden" name="back" value={back} />
      <Button type="submit" size="sm" variant={variant}>
        {label}
      </Button>
    </form>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {form("CONFIRMED", pending === 1 ? "Confirmar resultado" : `Confirmar ${pending} resultados`, "primary")}
      {form("DISCARDED", "Descartar pendientes", "ghost")}
    </div>
  );
}
