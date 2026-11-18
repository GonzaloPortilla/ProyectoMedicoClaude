import { Download, ExternalLink, FileText, Lock } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { signedFileUrl } from "@/server/files/urls";
import { formatBytes } from "@/lib/text";

/** El documento original, siempre visible y accesible desde la revisión. Nunca se modifica. */
export function OriginalDocument({ userId, file }: { userId: string; file: { id: string; originalName: string; mimeType: string; sizeBytes: number } }) {
  const url = signedFileUrl(userId, file.id);
  const isImage = file.mimeType.startsWith("image/");
  return (
    <div className="space-y-3">
      {isImage ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
          {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido con validación de sesión */}
          <img src={url} alt={`Documento original: ${file.originalName}`} className="max-h-[360px] w-full object-contain" />
        </a>
      ) : null}
      <div className="flex items-center gap-3 rounded-xl border border-line p-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 ring-inset">
          <FileText className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{file.originalName}</p>
          <p className="text-xs text-muted">
            {file.mimeType === "application/pdf" ? "PDF" : file.mimeType.replace("image/", "").toUpperCase()} · {formatBytes(file.sizeBytes)}
          </p>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "sm" })} aria-label={`Ver documento original ${file.originalName}`}>
          <ExternalLink className="size-3.5" /> <span className="hidden sm:inline">Ver</span>
        </a>
        <a href={signedFileUrl(userId, file.id, "attachment")} className={buttonClasses({ variant: "ghost", size: "sm" })} aria-label={`Descargar ${file.originalName}`}>
          <Download className="size-3.5" />
        </a>
      </div>
      <p className="flex items-start gap-1.5 text-xs text-muted">
        <Lock className="mt-0.5 size-3 shrink-0" aria-hidden /> Es la fuente principal: se conserva tal como lo subiste y nunca se modifica. Lo detectado se guarda aparte.
      </p>
    </div>
  );
}
