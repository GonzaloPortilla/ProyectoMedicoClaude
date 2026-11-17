import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Logo />
      <p className="mt-10 text-sm font-medium text-brand-600">Error 404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">No encontramos esta página</h1>
      <p className="mt-2 text-muted">Es posible que el enlace sea incorrecto o que la página ya no exista.</p>
      <ButtonLink href="/" className="mt-8">
        Volver al inicio
      </ButtonLink>
    </main>
  );
}
