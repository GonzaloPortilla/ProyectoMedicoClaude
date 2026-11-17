import { Lock, ShieldCheck, UserRound } from "lucide-react";
import { Logo } from "@/components/logo";

const points = [
  { Icon: Lock, title: "Seguridad desde el diseño", text: "Contraseñas con hash Argon2id, sesiones seguras y accesos controlados." },
  { Icon: UserRound, title: "Vos decidís quién accede", text: "Ningún profesional ve tu información sin tu autorización." },
  { Icon: ShieldCheck, title: "Profesionales verificados", text: "Validamos la matrícula de cada médico antes de habilitarlo." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-brand-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(60rem_40rem_at_-10%_-10%,rgba(20,156,136,0.55),transparent_60%),radial-gradient(40rem_30rem_at_110%_110%,rgba(56,189,248,0.25),transparent_60%)]"
        />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="relative">
          <Logo className="[&>span:last-child]:text-white" />
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight text-white">Tu información médica, ordenada y bajo tu control.</h2>
          <ul className="mt-10 space-y-6">
            {points.map(({ Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 ring-inset">
                  <Icon className="size-[18px] text-brand-100" />
                </span>
                <div>
                  <p className="font-medium text-white">{title}</p>
                  <p className="mt-0.5 text-sm text-white/65">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/45">Entorno de desarrollo · Datos ficticios</p>
      </aside>

      <main className="flex flex-col px-4 py-8 sm:px-8">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[420px]">{children}</div>
        </div>
      </main>
    </div>
  );
}
