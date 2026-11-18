import { formatNumber } from "@/features/documents/format";

export type ChartPoint = { id: string; date: Date; value: number; href: string; label: string; outside: boolean };

type Layout = { W: number; H: number; PAD: { top: number; right: number; bottom: number; left: number }; font: number; gap: number };
/** Dos proporciones: ancha (tablet/escritorio) y compacta (celular), para que el texto se lea en ambas. */
const WIDE: Layout = { W: 640, H: 260, PAD: { top: 18, right: 20, bottom: 34, left: 52 }, font: 11, gap: 72 };
const COMPACT: Layout = { W: 340, H: 230, PAD: { top: 16, right: 14, bottom: 32, left: 40 }, font: 11, gap: 64 };
const shortDate = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" });

function niceTicks(min: number, max: number, count = 4) {
  const span = max - min || Math.abs(max) || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/**
 * Gráfico de línea en SVG renderizado en el servidor. Cada punto es un enlace al estudio de
 * origen. La banda sombreada es el rango informado por el laboratorio del estudio más reciente
 * (sólo referencia visual: cada laboratorio informa el suyo).
 */
type ChartProps = { points: ChartPoint[]; unit: string | null; band: { low: number | null; high: number | null } | null; title: string };

function ChartSvg({ points, unit, band, title, layout, className }: ChartProps & { layout: Layout; className: string }) {
  const { W, H, PAD, font, gap } = layout;
  const values = points.map((p) => p.value);
  const extra = band ? [band.low, band.high].filter((v): v is number => v !== null) : [];
  let min = Math.min(...values, ...extra);
  let max = Math.max(...values, ...extra);
  const pad = (max - min || Math.abs(max) || 1) * 0.15;
  min = Math.max(0, min - pad);
  max = max + pad;
  const ticks = niceTicks(min, max);
  min = Math.min(min, ticks[0]!);
  max = Math.max(max, ticks[ticks.length - 1]!);

  const t0 = points[0]!.date.getTime();
  const t1 = points[points.length - 1]!.date.getTime();
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (d: Date) => (t1 === t0 ? PAD.left + innerW / 2 : PAD.left + ((d.getTime() - t0) / (t1 - t0)) * innerW);
  const y = (v: number) => PAD.top + innerH - ((v - min) / (max - min || 1)) * innerH;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  // Etiquetas del eje X sin superponerse: se omite una si queda a menos de 72 px de la anterior
  // (la última siempre se muestra; si choca, se oculta la previa).
  const xs = points.map((p) => x(p.date));
  const showLabel = new Array(points.length).fill(false) as boolean[];
  let lastShown = -Infinity;
  xs.forEach((px, i) => {
    if (px - lastShown >= gap) {
      showLabel[i] = true;
      lastShown = px;
    }
  });
  if (!showLabel[points.length - 1]) {
    for (let i = points.length - 2; i >= 0; i--) {
      if (showLabel[i] && xs[points.length - 1]! - xs[i]! < gap) showLabel[i] = false;
      if (showLabel[i]) break;
    }
    showLabel[points.length - 1] = true;
  }

  const bandTop = band ? y(band.high ?? max) : 0;
  const bandBottom = band ? y(band.low ?? min) : 0;

  return (
      <svg viewBox={`0 0 ${W} ${H}`} className={className} role="group" aria-label={`Gráfico de ${title}${unit ? ` en ${unit}` : ""}. Cada punto abre el estudio del que proviene.`}>
        {band && (band.low !== null || band.high !== null) ? (
          <rect x={PAD.left} y={Math.min(bandTop, bandBottom)} width={innerW} height={Math.abs(bandBottom - bandTop)} className="fill-brand-500/[0.08]" />
        ) : null}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted tabular-nums" fontSize={font}>
              {formatNumber(t)}
            </text>
          </g>
        ))}
        <path d={path} fill="none" className="stroke-brand-600" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <a key={p.id} href={p.href} aria-label={p.label} className="group outline-none">
            <title>{p.label}</title>
            <circle cx={x(p.date)} cy={y(p.value)} r={14} className="fill-transparent" />
            <circle
              cx={x(p.date)}
              cy={y(p.value)}
              r={5.5}
              strokeWidth={2.5}
              className={`${p.outside ? "fill-amber-400 stroke-surface" : "fill-brand-600 stroke-surface"} transition-[r] group-hover:[r:8] group-focus-visible:[r:8] group-focus-visible:stroke-ink`}
            />
            {showLabel[i] ? (
              <text x={x(p.date)} y={H - 10} textAnchor={x(p.date) > W - PAD.right - 30 ? "end" : x(p.date) < PAD.left + 30 ? "start" : "middle"} className="fill-muted" fontSize={font}>
                {shortDate.format(p.date)}
              </text>
            ) : null}
          </a>
        ))}
      </svg>
  );
}

export function EvolutionChart(props: ChartProps) {
  const { points, unit, band } = props;
  if (!points.length) return null;
  return (
    <figure className="w-full">
      <ChartSvg {...props} layout={COMPACT} className="h-auto w-full sm:hidden" />
      <ChartSvg {...props} layout={WIDE} className="hidden h-auto w-full sm:block" />
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-brand-600" /> Resultado{unit ? ` (${unit})` : ""}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-amber-400" /> Fuera del rango informado por el laboratorio
        </span>
        {band && (band.low !== null || band.high !== null) ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-4 rounded-sm bg-brand-500/15" /> Rango del estudio más reciente
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
