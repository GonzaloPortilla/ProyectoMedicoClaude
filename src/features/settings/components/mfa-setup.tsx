"use client";

import { Copy, Download, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { beginMfaSetupAction, confirmMfaSetupAction, type MfaSetupState } from "@/features/settings/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Configuración de la verificación en dos pasos: QR → código → códigos de recuperación. */
export function MfaSetup() {
  const [state, setState] = useState<MfaSetupState>({ step: "idle" });
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  if (state.step === "done" && state.recoveryCodes) {
    const text = state.recoveryCodes.join("\n");
    return (
      <div className="space-y-4">
        <Alert tone="success">Listo: la verificación en dos pasos quedó activada.</Alert>
        <div className="rounded-2xl bg-amber-50/60 p-4 ring-1 ring-amber-200/70 ring-inset">
          <p className="text-sm font-semibold text-ink">Guardá estos códigos de recuperación</p>
          <p className="mt-1 text-[13px] text-ink-soft">Sirven una sola vez cada uno, si perdés el teléfono. No vamos a volver a mostrarlos.</p>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm text-ink sm:grid-cols-5" data-testid="recovery-codes">
            {state.recoveryCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(text);
                setCopied(true);
              }}
            >
              <Copy className="size-3.5" /> {copied ? "Copiados" : "Copiar"}
            </Button>
            <a
              className="inline-flex h-8 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink shadow-card hover:bg-canvas"
              href={`data:text/plain;charset=utf-8,${encodeURIComponent(`Códigos de recuperación — Vitalia\n\n${text}\n`)}`}
              download="vitalia-codigos-recuperacion.txt"
            >
              <Download className="size-3.5" /> Descargar
            </a>
            <Button type="button" size="sm" onClick={() => router.refresh()}>
              Ya los guardé
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (state.step === "scan") {
    return (
      <div className="space-y-4">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        <ol className="space-y-1 text-sm text-ink-soft">
          <li>1. Abrí una app de autenticación (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
          <li>2. Escaneá el código QR o cargá la clave manualmente.</li>
          <li>3. Ingresá el código de 6 dígitos que te muestra la app.</li>
        </ol>
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          {/* eslint-disable-next-line @next/next/no-img-element -- QR generado en el servidor */}
          <img src={state.qrDataUrl} alt="Código QR para la app de autenticación" width={180} height={180} className="rounded-xl bg-white p-2 ring-1 ring-line" />
          <div className="min-w-0 space-y-3">
            <div>
              <p className="text-xs text-muted">Clave para cargar a mano</p>
              <p className="font-mono text-sm break-all text-ink" data-testid="mfa-secret">
                {state.secret?.match(/.{1,4}/g)?.join(" ")}
              </p>
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => setState(await confirmMfaSetupAction(code)));
              }}
            >
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                aria-label="Código de 6 dígitos"
                className="h-10 w-32 rounded-xl border border-line-strong bg-surface px-3 text-center font-mono text-base tracking-widest shadow-card focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none"
              />
              <Button type="submit" size="md" disabled={pending || code.length !== 6}>
                {pending ? "Verificando…" : "Activar"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Button type="button" onClick={() => start(async () => setState(await beginMfaSetupAction()))} disabled={pending}>
        <ShieldCheck className="size-4" /> {pending ? "Preparando…" : "Configurar verificación en dos pasos"}
      </Button>
    </div>
  );
}
