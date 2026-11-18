"use client";

import { Logo } from "@/components/logo";
import { Button, ButtonLink } from "@/components/ui/button";

/**
 * Error inesperado. Nunca muestra detalles internos (stack, mensajes de la base):
 * sólo un identificador para que soporte pueda buscar el error en los logs del servidor.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Logo />
      <h1 className="mt-10 text-2xl font-semibold tracking-tight text-ink">Algo salió mal</h1>
      <p className="mt-2 max-w-md text-muted">No pudimos completar la operación. Probá de nuevo; si el problema sigue, contactá a soporte.</p>
      {error.digest ? <p className="mt-3 font-mono text-xs text-muted">Código: {error.digest}</p> : null}
      <div className="mt-8 flex gap-2">
        <Button onClick={reset}>Reintentar</Button>
        <ButtonLink href="/" variant="secondary">
          Ir al inicio
        </ButtonLink>
      </div>
    </main>
  );
}
