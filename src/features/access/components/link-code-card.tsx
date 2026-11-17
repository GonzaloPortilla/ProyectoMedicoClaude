"use client";

import { Copy, KeyRound, RefreshCw, X } from "lucide-react";
import { useState, useTransition } from "react";
import { cancelLinkCodeAction, generateLinkCodeAction } from "@/features/access/actions";
import { formatLinkCode } from "@/features/access/resources";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

const time = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });

/**
 * El paciente genera un código de un solo uso para que un médico pueda pedirle acceso.
 * El código en claro sólo existe en este momento: en la base se guarda su hash.
 */
export function LinkCodeCard({ hasActiveCode, activeUntil }: { hasActiveCode: boolean; activeUntil: string | null }) {
  const [pending, start] = useTransition();
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [active, setActive] = useState(hasActiveCode);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = () =>
    start(async () => {
      const r = await generateLinkCodeAction();
      if (r.error) return setError(r.error);
      setError(null);
      setCode(r.code ?? null);
      setExpiresAt(r.expiresAt ?? null);
      setActive(true);
      setCopied(false);
    });

  const cancel = () =>
    start(async () => {
      await cancelLinkCodeAction();
      setCode(null);
      setExpiresAt(null);
      setActive(false);
    });

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {code ? (
        <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-white p-5 text-center ring-1 ring-brand-100 ring-inset">
          <p className="text-xs font-medium tracking-wide text-brand-700 uppercase">Tu código</p>
          <p className="mt-2 font-mono text-3xl font-semibold tracking-[0.18em] text-ink sm:text-4xl" data-testid="link-code">
            {formatLinkCode(code)}
          </p>
          <p className="mt-2 text-[13px] text-muted">Válido por un solo uso, hasta las {expiresAt ? time.format(new Date(expiresAt)) : "—"} h.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(formatLinkCode(code));
                setCopied(true);
              }}
            >
              <Copy className="size-3.5" /> {copied ? "Copiado" : "Copiar"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={cancel} disabled={pending}>
              <X className="size-3.5" /> Anular
            </Button>
          </div>
        </div>
      ) : active ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-canvas/70 p-4 ring-1 ring-line ring-inset sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-soft">
            Tenés un código activo{activeUntil ? ` hasta las ${time.format(new Date(activeUntil))} h` : ""}. Por seguridad no se vuelve a mostrar.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={generate} disabled={pending}>
              <RefreshCw className="size-3.5" /> Generar otro
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={cancel} disabled={pending}>
              Anular
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" onClick={generate} disabled={pending} className="w-full sm:w-auto">
          <KeyRound className="size-4" /> {pending ? "Generando…" : "Generar código"}
        </Button>
      )}
      <ol className="space-y-1.5 text-[13px] text-muted">
        <li>1. Generá un código y dáselo a tu médico (en la consulta o por mensaje).</li>
        <li>2. Tu médico lo ingresa y te llega una solicitud acá.</li>
        <li>3. Vos elegís qué compartir y por cuánto tiempo. Podés revocarlo cuando quieras.</li>
      </ol>
    </div>
  );
}
