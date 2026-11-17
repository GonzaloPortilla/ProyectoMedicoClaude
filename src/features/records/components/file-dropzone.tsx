"use client";

import { FileText, ImageIcon, UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/text";

const MAX = 15 * 1024 * 1024;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

/** Selector de archivo con arrastrar y soltar. La validación definitiva ocurre en el servidor. */
export function FileDropzone({ error, onPick }: { error?: string[]; onPick?: (name: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function accept(f: File | null) {
    setLocalError(null);
    if (!f) {
      setFile(null);
      onPick?.(null);
      return;
    }
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "jpg", "jpeg", "png"].includes(ext ?? "")) {
      setLocalError("Formato no permitido. Subí un PDF, JPG o PNG.");
    } else if (f.size > MAX) {
      setLocalError("El archivo supera el máximo de 15 MB.");
    }
    setFile(f);
    onPick?.(f.name);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    accept(null);
  }

  const message = localError ?? error?.[0];
  const isImage = file && /\.(jpe?g|png)$/i.test(file.name);

  return (
    <div className="space-y-1.5">
      <label
        htmlFor="file"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped && inputRef.current) {
            const dt = new DataTransfer();
            dt.items.add(dropped);
            inputRef.current.files = dt.files;
            accept(dropped);
          }
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors",
          dragging ? "border-brand-500 bg-brand-50/60" : message ? "border-red-300 bg-red-50/40" : "border-line-strong bg-canvas/60 hover:border-brand-500/60 hover:bg-brand-50/30",
          file && "hidden",
        )}
      >
        <span className="flex size-11 items-center justify-center rounded-2xl bg-surface text-brand-600 shadow-card ring-1 ring-line">
          <UploadCloud className="size-5" />
        </span>
        <span className="mt-3 text-sm font-medium text-ink">Arrastrá un archivo o tocá para elegirlo</span>
        <span className="mt-1 text-[13px] text-muted">PDF, JPG o PNG · hasta 15 MB</span>
      </label>
      <input ref={inputRef} id="file" name="file" type="file" accept={ACCEPT} className="sr-only" onChange={(e) => accept(e.target.files?.[0] ?? null)} />

      {file ? (
        <div className={cn("flex items-center gap-3 rounded-2xl border bg-surface p-3 shadow-card", message ? "border-red-300" : "border-line")}>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 ring-inset">
            {isImage ? <ImageIcon className="size-5" /> : <FileText className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{file.name}</p>
            <p className="text-xs text-muted">{formatBytes(file.size)}</p>
          </div>
          <button type="button" onClick={clear} aria-label="Quitar archivo" className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-ink/[0.05] hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
      ) : null}
      {message ? <p className="text-[13px] text-red-600">{message}</p> : null}
    </div>
  );
}
