import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EvolutionChart, type ChartPoint } from "@/features/documents/components/evolution-chart";
import { IndicatorSelect } from "@/features/documents/components/indicator-select";
import { methodShort, num, rangeNote, referenceLabel } from "@/features/documents/format";
import type { IndicatorSummary, SeriesPoint } from "@/server/documents/measurements";
import { cn, formatDate, fullName } from "@/lib/utils";

/**
 * Vista de evolución compartida por paciente y médico. Recibe datos YA filtrados por el
 * servidor (el médico sólo recibe categorías autorizadas) y funciones para armar enlaces.
 */
export function EvolutionView({
  indicators,
  selected,
  series,
  indicatorHref,
  recordHref,
  fileHref,
  viewer,
}: {
  indicators: IndicatorSummary[];
  selected: IndicatorSummary;
  series: SeriesPoint[];
  indicatorHref: (key: string) => string;
  recordHref: (recordId: string) => string;
  fileHref: (fileId: string) => string;
  viewer: "patient" | "doctor";
}) {
  // El gráfico usa la unidad más frecuente; valores en otras unidades se listan en la tabla.
  const unitCounts = new Map<string, number>();
  for (const p of series) if (num(p.valueNumeric) !== null) unitCounts.set(p.unit ?? "", (unitCounts.get(p.unit ?? "") ?? 0) + 1);
  const mainUnit = [...unitCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const chartSeries = series.filter((p) => num(p.valueNumeric) !== null && (p.unit ?? "") === mainUnit);
  const otherUnits = series.filter((p) => num(p.valueNumeric) !== null && (p.unit ?? "") !== mainUnit).length;
  const latest = series[series.length - 1];
  const latestWithRange = [...chartSeries].reverse().find((p) => p.refLow !== null || p.refHigh !== null);

  const points: ChartPoint[] = chartSeries.map((p) => {
    const value = num(p.valueNumeric)!;
    const inst = p.institution?.name ?? p.record.institution?.name;
    return {
      id: p.id,
      date: p.measuredOn,
      value,
      href: recordHref(p.record.id),
      outside: !!rangeNote(value, num(p.refLow), num(p.refHigh), null),
      label: `${p.valueText}${p.unit ? ` ${p.unit}` : ""} · ${formatDate(p.measuredOn)} · ${p.record.title}${inst ? ` · ${inst}` : ""}. Abrir estudio.`,
    };
  });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="lg:hidden">
        <IndicatorSelect
          selected={selected.key}
          options={indicators.map((i) => ({ key: i.key, label: `${i.name} · ${i.count === 1 ? "1 resultado" : `${i.count} resultados`}`, href: indicatorHref(i.key) }))}
        />
      </div>
      <nav aria-label="Indicadores" className="hidden min-w-0 lg:block">
        <ul className="flex flex-col gap-2">
          {indicators.map((i) => {
            const active = i.key === selected.key;
            return (
              <li key={i.key}>
                <Link
                  href={indicatorHref(i.key)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block rounded-xl px-3 py-2.5 ring-1 transition-colors ring-inset",
                    active ? "bg-brand-50 text-brand-900 ring-brand-200" : "bg-surface text-ink ring-line hover:bg-ink/[0.03]",
                  )}
                >
                  <span className="block text-sm font-medium ">{i.name}</span>
                  <span className="block text-xs whitespace-nowrap text-muted">
                    {i.lastValue}
                    {i.lastUnit ? ` ${i.lastUnit}` : ""} · {i.count === 1 ? "1 resultado" : `${i.count} resultados`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0 space-y-5">
        <Card>
          <CardHeader
            title={selected.name}
            description={latest ? `Último: ${latest.valueText}${latest.unit ? ` ${latest.unit}` : ""} · ${formatDate(latest.measuredOn)} · ${series.length === 1 ? "1 resultado" : `${series.length} resultados`}` : undefined}
          />
          <CardBody>
            {points.length >= 1 ? (
              <EvolutionChart points={points} unit={mainUnit || null} band={latestWithRange ? { low: num(latestWithRange.refLow), high: num(latestWithRange.refHigh) } : null} title={selected.name} />
            ) : (
              <p className="text-sm text-muted">No hay valores numéricos para graficar.</p>
            )}
            {otherUnits ? <p className="mt-2 text-xs text-muted">{otherUnits === 1 ? "Un resultado está" : `${otherUnits} resultados están`} en otra unidad: se muestran en la tabla, pero no en el gráfico.</p> : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Detalle" description="Cada valor muestra el documento del que proviene." />
          <CardBody>
            {/* Celular: lista apilada. Desde tablet: tabla. */}
            <ul className="divide-y divide-line sm:hidden">
              {[...series].reverse().map((p) => {
                const low = num(p.refLow);
                const high = num(p.refHigh);
                const note = rangeNote(num(p.valueNumeric), low, high, p.documentFlag);
                const ref = referenceLabel(low, high, p.unit, p.refText);
                return (
                  <li key={p.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-ink-soft">{formatDate(p.measuredOn)}</span>
                      <span className="text-right">
                        <span className="font-semibold text-ink tabular-nums">{p.valueText}</span>
                        {p.unit ? <span className="ml-1 text-sm text-muted">{p.unit}</span> : null}
                      </span>
                    </div>
                    {note ? <p className="mt-0.5 text-xs text-amber-800">{note}</p> : null}
                    <p className="mt-0.5 text-xs text-muted">
                      {ref ? `Referencia: ${ref}` : "Sin referencia"}
                      {p.institution?.name ?? p.record.institution?.name ? ` · ${p.institution?.name ?? p.record.institution?.name}` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <Link href={recordHref(p.record.id)} className="inline-flex items-center gap-1 font-medium text-brand-700">
                        <FileText className="size-3.5" aria-hidden /> {p.record.title}
                      </Link>
                      {p.fileId ? (
                        <a href={fileHref(p.fileId)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted">
                          <ExternalLink className="size-3" aria-hidden /> Original
                        </a>
                      ) : null}
                      <span className="text-muted">{methodShort(p.extractionMethod)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="-mx-5 hidden overflow-x-auto sm:-mx-6 sm:block">
              <table className="w-full min-w-[620px] text-left text-sm">
                <caption className="sr-only">Resultados de {selected.name} ordenados por fecha</caption>
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th scope="col" className="py-2 pr-3 pl-5 font-medium sm:pl-6">Fecha</th>
                    <th scope="col" className="px-3 py-2 font-medium">Valor</th>
                    <th scope="col" className="px-3 py-2 font-medium">Referencia</th>
                    <th scope="col" className="px-3 py-2 font-medium">Institución</th>
                    <th scope="col" className="py-2 pr-5 pl-3 font-medium sm:pr-6">Documento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...series].reverse().map((p) => {
                    const low = num(p.refLow);
                    const high = num(p.refHigh);
                    const note = rangeNote(num(p.valueNumeric), low, high, p.documentFlag);
                    return (
                      <tr key={p.id} className="align-top">
                        <td className="py-3 pr-3 pl-5 whitespace-nowrap text-ink sm:pl-6">{formatDate(p.measuredOn)}</td>
                        <td className="px-3 py-3">
                          <span className="font-semibold text-ink tabular-nums">{p.valueText}</span>
                          {p.unit ? <span className="ml-1 text-muted">{p.unit}</span> : null}
                          {note ? <span className="mt-0.5 block text-xs text-amber-800">{note}</span> : null}
                        </td>
                        <td className="px-3 py-3 text-muted">{referenceLabel(low, high, p.unit, p.refText) ?? "—"}</td>
                        <td className="px-3 py-3 text-muted">{p.institution?.name ?? p.record.institution?.name ?? "—"}</td>
                        <td className="py-3 pr-5 pl-3 sm:pr-6">
                          <Link href={recordHref(p.record.id)} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                            <FileText className="size-3.5" aria-hidden /> {p.record.title}
                          </Link>
                          {p.fileId ? (
                            <a href={fileHref(p.fileId)} target="_blank" rel="noopener noreferrer" className="mt-0.5 flex items-center gap-1 text-xs text-muted hover:text-ink">
                              <ExternalLink className="size-3" aria-hidden /> Ver original
                            </a>
                          ) : null}
                          <span className="mt-0.5 block text-xs text-muted">
                            {methodShort(p.extractionMethod)}
                            {p.editedAt ? " · corregido" : ""}
                            {p.confirmedBy ? ` · confirmado por ${fullName(p.confirmedBy)}` : ""}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
        <p className="text-xs text-muted">
          {viewer === "doctor" ? "Sólo se muestran resultados confirmados por el paciente y provenientes de las categorías que te autorizó. " : ""}
          Los rangos de referencia los informa cada laboratorio y pueden variar según la metodología. Esta sección muestra tus resultados en el tiempo; no los interpreta. El documento original siempre está disponible desde cada fila.
        </p>
      </div>
    </div>
  );
}
