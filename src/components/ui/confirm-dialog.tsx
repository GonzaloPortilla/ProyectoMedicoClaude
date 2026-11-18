"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Confirmación para operaciones importantes (eliminar, revocar, rechazar…).
 * Usa <dialog> nativo: atrapa el foco, se cierra con Escape y es accesible por teclado.
 * Al confirmar envía un formulario a la server action con los campos ocultos indicados.
 */
type Trigger = {
  /** Contenido del botón que abre el diálogo. */
  content: ReactNode;
  ariaLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  /** Botón sin estilos de Button (sólo `className`), p. ej. un ícono. */
  bare?: boolean;
  className?: string;
};

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel = "Procesando…",
  action,
  fields,
  tone = "danger",
}: {
  trigger: Trigger;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  tone?: "danger" | "neutral";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  // El diálogo se monta sólo al abrirlo (páginas más livianas, sin texto oculto duplicado).
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open && ref.current && !ref.current.open) ref.current.showModal();
  }, [open]);
  return (
    <>
      {trigger.bare ? (
        <button type="button" aria-label={trigger.ariaLabel} aria-haspopup="dialog" className={trigger.className} onClick={() => setOpen(true)}>
          {trigger.content}
        </button>
      ) : (
        <Button type="button" variant={trigger.variant ?? "danger"} size={trigger.size ?? "sm"} aria-label={trigger.ariaLabel} aria-haspopup="dialog" className={trigger.className} onClick={() => setOpen(true)}>
          {trigger.content}
        </Button>
      )}
      {open ? (
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="m-auto w-[min(92vw,440px)] rounded-[22px] border border-line bg-surface p-0 text-ink shadow-[0_24px_64px_-16px_rgba(11,18,32,0.35)] backdrop:bg-ink/40 backdrop:backdrop-blur-[2px] open:animate-[dialog-in_160ms_ease-out]"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close(); // clic fuera
        }}
      >
        <form action={action} className="p-6">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <div className="flex gap-4">
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset", tone === "danger" ? "bg-red-50 text-red-600 ring-red-100" : "bg-brand-50 text-brand-600 ring-brand-100")}>
              <AlertTriangle aria-hidden className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="text-[16px] font-semibold tracking-tight">
                {title}
              </h2>
              <div id={descId} className="mt-1.5 text-sm leading-relaxed text-muted">
                {description}
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => ref.current?.close()} autoFocus>
              Cancelar
            </Button>
            <SubmitButton variant={tone === "danger" ? "danger" : "primary"} pendingLabel={pendingLabel} className={tone === "danger" ? "border-red-600 bg-red-600 text-white hover:bg-red-700" : ""}>
              {confirmLabel}
            </SubmitButton>
          </div>
        </form>
      </dialog>
      ) : null}
    </>
  );
}
