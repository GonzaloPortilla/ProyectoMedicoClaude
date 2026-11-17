import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/features/auth/components/auth-heading";
import { RegisterPatientForm } from "@/features/auth/components/register-patient-form";
import { redirectIfAuthenticated } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function RegisterPage() {
  await redirectIfAuthenticated();
  return (
    <>
      <AuthHeading eyebrow="Cuenta de paciente" title="Creá tu cuenta" description="Empezá a organizar tu información médica en un lugar seguro." />
      <RegisterPatientForm />
      <div className="mt-8 space-y-2 border-t border-line pt-6 text-sm text-muted">
        <p>
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className="font-medium text-ink hover:text-brand-700">
            Ingresá
          </Link>
        </p>
        <p>
          ¿Sos médico?{" "}
          <Link href="/register/doctor" className="font-medium text-ink hover:text-brand-700">
            Usá el registro profesional
          </Link>
        </p>
      </div>
    </>
  );
}
