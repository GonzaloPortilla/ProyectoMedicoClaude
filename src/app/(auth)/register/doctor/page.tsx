import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/features/auth/components/auth-heading";
import { RegisterDoctorForm } from "@/features/auth/components/register-doctor-form";
import { redirectIfAuthenticated } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Registro profesional" };

export default async function RegisterDoctorPage() {
  await redirectIfAuthenticated();
  return (
    <>
      <AuthHeading
        eyebrow="Cuenta profesional"
        title="Registro para médicos"
        description="Revisaremos tu matrícula antes de habilitar tu cuenta. Mientras tanto vas a poder ingresar y ver el estado de tu solicitud."
      />
      <RegisterDoctorForm />
      <p className="mt-8 border-t border-line pt-6 text-sm text-muted">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="font-medium text-ink hover:text-brand-700">
          Ingresá
        </Link>
      </p>
    </>
  );
}
