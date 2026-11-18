import type { Metadata } from "next";
import { MailCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { AuthHeading } from "@/features/auth/components/auth-heading";

export const metadata: Metadata = { title: "Revisá tu email" };

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { professional } = await searchParams;
  return (
    <>
      <span className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 ring-inset">
        <MailCheck className="size-6" />
      </span>
      <AuthHeading
        title="Revisá tu email"
        description="Si los datos son correctos, te enviamos un enlace para activar tu cuenta. Vence en 24 horas."
      />
      <div className="space-y-3 text-sm text-ink-soft">
        <p>Abrí el enlace desde el mismo dispositivo y después ingresá con tu email y contraseña.</p>
        {professional === "1" ? <p>Una vez activada, vamos a revisar tu matrícula antes de habilitar las funciones profesionales.</p> : null}
        <p className="text-[13px] text-muted">¿No te llegó? Revisá la carpeta de spam. Si intentás ingresar sin activar la cuenta, te lo reenviamos.</p>
      </div>
      <ButtonLink href="/login" size="lg" variant="secondary" className="mt-8 w-full">
        Ir a ingresar
      </ButtonLink>
    </>
  );
}
