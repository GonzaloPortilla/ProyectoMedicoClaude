import type { Metadata } from "next";
import { AuthHeading } from "@/features/auth/components/auth-heading";
import { VerifyEmailForm } from "@/features/auth/components/verify-email-form";

export const metadata: Metadata = { title: "Activar cuenta", referrer: "no-referrer" };

/**
 * La activación requiere un clic (POST): algunos servicios de correo abren los enlaces
 * automáticamente para analizarlos, y eso no debe consumir el token.
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await searchParams;
  return (
    <>
      <AuthHeading title="Activá tu cuenta" description="Confirmá que este email es tuyo para empezar a usar Vitalia." />
      <VerifyEmailForm token={typeof token === "string" ? token.slice(0, 200) : ""} />
    </>
  );
}
