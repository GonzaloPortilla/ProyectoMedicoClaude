import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AuthHeading } from "@/features/auth/components/auth-heading";
import { MfaLoginForm } from "@/features/auth/components/mfa-login-form";
import { getMfaChallengeCookie } from "@/server/auth/cookies";
import { readMfaChallenge } from "@/server/auth/mfa";

export const metadata: Metadata = { title: "Verificación en dos pasos" };

export default async function MfaLoginPage() {
  // Sin un desafío válido (contraseña correcta hace < 5 min) no hay nada que verificar.
  if (!readMfaChallenge(await getMfaChallengeCookie())) redirect("/login");
  return (
    <>
      <span className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 ring-inset">
        <ShieldCheck className="size-6" />
      </span>
      <AuthHeading title="Verificación en dos pasos" description="Abrí tu app de autenticación e ingresá el código." />
      <MfaLoginForm />
      <Link href="/login" className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Usar otra cuenta
      </Link>
    </>
  );
}
