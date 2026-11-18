import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { AuthHeading } from "@/features/auth/components/auth-heading";
import { LoginForm } from "@/features/auth/components/login-form";
import { redirectIfAuthenticated } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await redirectIfAuthenticated();
  const { reset, verified } = await searchParams;
  return (
    <>
      <AuthHeading title="Bienvenido de nuevo" description="Ingresá a tu cuenta para continuar." />
      {verified === "1" ? (
        <Alert tone="success" className="mb-5">
          Tu email quedó verificado. Ya podés ingresar.
        </Alert>
      ) : null}
      {reset === "1" ? (
        <Alert tone="success" className="mb-5">
          Tu contraseña se actualizó. Ya podés ingresar.
        </Alert>
      ) : null}
      <LoginForm />
      <div className="mt-8 space-y-2 border-t border-line pt-6 text-sm text-muted">
        <p>
          ¿No tenés cuenta?{" "}
          <Link href="/register" className="font-medium text-ink hover:text-brand-700">
            Registrate como paciente
          </Link>
        </p>
        <p>
          ¿Sos profesional de la salud?{" "}
          <Link href="/register/doctor" className="font-medium text-ink hover:text-brand-700">
            Solicitá tu cuenta profesional
          </Link>
        </p>
      </div>
    </>
  );
}
