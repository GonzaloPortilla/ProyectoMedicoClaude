import { FileSignature, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/features/access/format";

type Report = {
  authorName: string;
  licenseNumber: string;
  licenseJurisdiction: string;
  specialty: string;
  currentVersion: number;
  createdAt: Date;
  versions: { version: number; title: string; content: string; changeReason: string | null; createdAt: Date }[];
};

/** Informe médico firmado, con historial de versiones (nunca se pierde una versión anterior). */
export function ReportView({ report }: { report: Report }) {
  const [current, ...previous] = report.versions;
  if (!current) return null;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line bg-violet-50/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 ring-1 ring-violet-100 ring-inset">
            <FileSignature className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Informe médico</p>
            <p className="text-[13px] text-muted">
              Dr/a. {report.authorName} · {report.specialty} · Mat. {report.licenseNumber} ({report.licenseJurisdiction})
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="violet">Versión {report.currentVersion}</Badge>
          {report.currentVersion > 1 ? <Badge tone="amber">Corregido</Badge> : null}
        </div>
      </div>
      <div className="px-5 py-5 sm:px-6">
        <p className="mb-3 text-[13px] text-muted">
          Emitido el {formatDateTime(report.createdAt)}
          {report.currentVersion > 1 ? ` · última corrección el ${formatDateTime(current.createdAt)}` : ""}
        </p>
        <div className="text-sm leading-relaxed break-words whitespace-pre-line text-ink" data-testid="report-content">
          {current.content}
        </div>
        {current.changeReason ? (
          <p className="mt-4 rounded-xl bg-amber-50/70 px-3.5 py-2.5 text-[13px] text-amber-900 ring-1 ring-amber-100 ring-inset">
            <span className="font-medium">Motivo de la corrección:</span> {current.changeReason}
          </p>
        ) : null}
        {previous.length ? (
          <details className="group mt-5 border-t border-line pt-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
              <History className="size-4" /> Versiones anteriores ({previous.length})
            </summary>
            <ol className="mt-3 space-y-3">
              {previous.map((v) => (
                <li key={v.version} className="rounded-xl bg-canvas/70 p-4 ring-1 ring-line ring-inset">
                  <p className="mb-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                    <Badge>Versión {v.version}</Badge> {v.title} · {formatDateTime(v.createdAt)}
                  </p>
                  <p className="text-[13px] leading-relaxed break-words whitespace-pre-line text-ink-soft">{v.content}</p>
                  {v.changeReason ? <p className="mt-2 text-[12px] text-muted">Motivo: {v.changeReason}</p> : null}
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>
    </Card>
  );
}
