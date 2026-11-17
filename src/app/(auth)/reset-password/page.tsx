import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { AuthHeading } from "@/features/auth/components/auth-heading";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { isPasswordResetTokenValid } from "@/server/auth/service";

export const metadata: Metadata = { title: "Nueva contraseña", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";
  const valid = await isPasswordResetTokenValid(value);

  if (!valid) {
    return (
      <>
        <AuthHeading title="Enlace no válido" />
        <Alert tone="error">El enlace de recuperación no es válido o ya expiró.</Alert>
        <ButtonLink href="/forgot-password" size="lg" className="mt-6 w-full">
          Pedir un enlace nuevo
        </ButtonLink>
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Elegí una nueva contraseña" description="Por seguridad, se cerrarán todas tus sesiones abiertas." />
      <ResetPasswordForm token={value} />
    </>
  );
}
