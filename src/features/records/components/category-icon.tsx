import { Bone, Brain, Eye, FileText, FlaskConical, HeartPulse, Hospital, Pill, ScanLine, Scissors, Smile, Stethoscope, Syringe, Baby, Sparkles, Activity, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const MAP: Record<string, { Icon: LucideIcon; cls: string }> = {
  laboratorio: { Icon: FlaskConical, cls: "bg-sky-50 text-sky-600 ring-sky-100" },
  cardiologia: { Icon: HeartPulse, cls: "bg-rose-50 text-rose-600 ring-rose-100" },
  "diagnostico-por-imagenes": { Icon: ScanLine, cls: "bg-indigo-50 text-indigo-600 ring-indigo-100" },
  traumatologia: { Icon: Bone, cls: "bg-orange-50 text-orange-600 ring-orange-100" },
  "clinica-medica": { Icon: Stethoscope, cls: "bg-brand-50 text-brand-600 ring-brand-100" },
  odontologia: { Icon: Smile, cls: "bg-cyan-50 text-cyan-600 ring-cyan-100" },
  dermatologia: { Icon: Sparkles, cls: "bg-pink-50 text-pink-600 ring-pink-100" },
  oftalmologia: { Icon: Eye, cls: "bg-blue-50 text-blue-600 ring-blue-100" },
  neurologia: { Icon: Brain, cls: "bg-violet-50 text-violet-600 ring-violet-100" },
  pediatria: { Icon: Baby, cls: "bg-amber-50 text-amber-600 ring-amber-100" },
  "salud-mental": { Icon: Brain, cls: "bg-purple-50 text-purple-600 ring-purple-100" },
  cirugias: { Icon: Scissors, cls: "bg-sky-50 text-sky-700 ring-sky-100" },
  internaciones: { Icon: Hospital, cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  vacunas: { Icon: Syringe, cls: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  recetas: { Icon: Pill, cls: "bg-violet-50 text-violet-600 ring-violet-100" },
};
const FALLBACK = { Icon: Activity, cls: "bg-ink/[0.04] text-ink-soft ring-line" };
const FILE = { Icon: FileText, cls: FALLBACK.cls };

export function CategoryIcon({ slug, className = "size-10" }: { slug: string; className?: string }) {
  const { Icon, cls } = MAP[slug] ?? (slug === "file" ? FILE : FALLBACK);
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-xl ring-1 ring-inset", cls, className)}>
      <Icon className="size-[45%]" />
    </span>
  );
}
