import Link from "next/link";
import { ArrowRight, FileText, Lock, ShieldCheck, Stethoscope } from "lucide-react";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";
import { getCurrentUser } from "@/server/auth/dal";
import { homePathForRoles } from "@/server/auth/roles";

const features = [
  { Icon: FileText, title: "Todo en un lugar", text: "Tu historial, estudios e informes, ordenados y siempre disponibles." },
  { Icon: Lock, title: "Privado por defecto", text: "Nadie accede a tu información sin tu autorización expresa." },
  { Icon: Stethoscope, title: "Médicos verificados", text: "Sólo profesionales con matrícula validada pueden solicitar acceso." },
  { Icon: ShieldCheck, title: "Accesos registrados", text: "Vas a saber quién vio tu información y cuándo." },
];

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(50rem_28rem_at_50%_-8rem,rgba(20,156,136,0.16),transparent_70%)]" />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-2">
          {user ? (
            <ButtonLink href={homePathForRoles(user.roles)} size="sm">
              Ir a mi panel
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">
                Ingresar
              </ButtonLink>
              <ButtonLink href="/register" size="sm">
                Crear cuenta
              </ButtonLink>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 sm:px-6">
        <section className="mx-auto max-w-3xl pt-16 pb-16 text-center sm:pt-24">
          <p className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1 text-[13px] font-medium text-ink-soft shadow-card backdrop-blur">
            <span className="size-1.5 rounded-full bg-brand-500" /> Tu salud, bajo tu control
          </p>
          <h1 className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance text-ink sm:text-6xl">Tu información médica, segura y en un solo lugar.</h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-pretty text-muted">
            Guardá tus datos de salud y compartilos sólo con los profesionales que vos elijas, cuando vos quieras.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/register" size="lg" className="w-full sm:w-auto">
              Crear cuenta de paciente <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink href="/register/doctor" size="lg" variant="secondary" className="w-full sm:w-auto">
              Soy profesional de la salud
            </ButtonLink>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-4" aria-label="Características">
          {features.map(({ Icon, title, text }) => (
            <div key={title} className="rounded-[var(--radius-card)] border border-line bg-surface/80 p-5 shadow-card backdrop-blur">
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 ring-inset">
                <Icon className="size-[18px]" />
              </span>
              <h2 className="mt-4 text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-[13px] text-muted sm:flex-row sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Vitalia · Proyecto en desarrollo</p>
          <p>
            ¿Ya tenés cuenta?{" "}
            <Link href="/login" className="font-medium text-ink hover:text-brand-700">
              Ingresá
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
