"use client";

import Link from "next/link";
import { Copy, FileText, ImageIcon, UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";
import { cn, formatDate } from "@/lib/utils";
import { formatBytes } from "@/lib/text";
import { buttonClasses } from "@/components/ui/button";
import { checkDuplicateAction, type DuplicateCheck } from "@/features/documents/actions";

const MAX = 15 * 1024 * 1024;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

type Duplicate = NonNullable<DuplicateCheck["duplicate"]>;

/** SHA-256 en el navegador (sólo en contextos seguros: https o localhost). */
async function sha256Hex(f: File): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const digest = await crypto.subtle.digest("SHA-256", await f.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/**
 * Selector de archivo con arrastrar y soltar. La validación definitiva ocurre en el servidor.
 * Antes de subir, compara el hash con los archivos del paciente y avisa si ya lo cargó.
 * `onBlockedChange(true)` mientras hay una decisión pendiente (el formulario no se envía).
 */
export function FileDropzone({ error, onPick, onBlockedChange }: { error?: string[]; onPick?: (name: string | null) => void; onBlockedChange?: (blocked: boolean) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [checking, setChecking] = useState(false);
  const pickId = useRef(0);

  function accept(f: File | null) {
    setLocalError(null);
    setDuplicate(null);
    setAllowDuplicate(false);
    onBlockedChange?.(false);
    const id = ++pickId.current;
    if (!f) {
      setFile(null);
      onPick?.(null);
      return;
    }
    const ext = f.name.split(".").pop()?.toLowerCase();
    let valid = true;
    if (!["pdf", "jpg", "jpeg", "png"].includes(ext ?? "")) {
      setLocalError("Formato no permitido. Subí un PDF, JPG o PNG.");
      valid = false;
    } else if (f.size > MAX) {
      setLocalError("El archivo supera el máximo de 15 MB.");
      valid = false;
    }
    setFile(f);
    onPick?.(f.name);
    if (!valid) return;
    setChecking(true);
    onBlockedChange?.(true);
    void (async () => {
      const hash = await sha256Hex(f);
      const result = hash ? await checkDuplicateAction(hash).catch(() => ({ duplicate: null })) : { duplicate: null };
      if (id !== pickId.current) return; // el usuario ya eligió otro archivo
      setChecking(false);
      setDuplicate(result.duplicate);
      onBlockedChange?.(!!result.duplicate);
    })();
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
      {allowDuplicate ? <input type="hidden" name="allowDuplicate" value="1" /> : null}

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
      {checking ? (
        <p className="text-[13px] text-muted" role="status">
          Revisando si ya lo cargaste…
        </p>
      ) : null}
      {duplicate && !allowDuplicate ? (
        <div role="alert" className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200/70 ring-inset">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <Copy className="size-4" aria-hidden /> Este archivo parece estar cargado anteriormente.
          </p>
          <p className="mt-1 text-[13px] text-amber-900/80">
            «{duplicate.title}» · {formatDate(new Date(`${duplicate.occurredOn}T00:00:00Z`))}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/patient/documents/${duplicate.recordId}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Ver existente
            </Link>
            <button
              type="button"
              className={buttonClasses({ variant: "ghost", size: "sm" })}
              onClick={() => {
                setAllowDuplicate(true);
                onBlockedChange?.(false);
              }}
            >
              Cargar igualmente
            </button>
            <button type="button" className={buttonClasses({ variant: "ghost", size: "sm" })} onClick={clear}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
      {duplicate && allowDuplicate ? <p className="text-[13px] text-muted">Se va a guardar como un estudio nuevo. No se borra nada.</p> : null}
    </div>
  );
}
