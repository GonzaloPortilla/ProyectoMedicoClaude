import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthHeading } from "@/features/auth/components/auth-heading";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading title="Recuperá tu contraseña" description="Ingresá tu email y te enviaremos un enlace para elegir una nueva." />
      <ForgotPasswordForm />
      <Link href="/login" className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Volver a ingresar
      </Link>
    </>
  );
}
