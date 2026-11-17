import type { Metadata } from "next";
import { Activity, Droplet, HeartPulse, Hospital, Pill, Scissors, ShieldAlert, Syringe, Users, Phone } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EntryCard } from "@/features/health/components/entry-card";
import { VitalsForm } from "@/features/health/components/vitals-form";
import { BLOOD_TYPE_LABELS, SEVERITY_LABELS } from "@/features/health/config";
import { getHealthOverview } from "@/server/medical/health";
import { requirePatient } from "@/server/patient/context";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Mi salud" };

const join = (...parts: Array<string | null | undefined | false>) => parts.filter(Boolean).join(" · ") || null;

function bmi(heightCm: number | null | undefined, weightKg: number | null | undefined) {
  if (!heightCm || !weightKg) return null;
  const value = weightKg / (heightCm / 100) ** 2;
  return Math.round(value * 10) / 10;
}

export default async function HealthPage() {
  const { patientId } = await requirePatient();
  const h = await getHealthOverview(patientId);
  const imc = bmi(h.vitals?.heightCm, h.vitals?.weightKg);

  const stats = [
    { label: "Grupo sanguíneo", value: h.vitals?.bloodType ? BLOOD_TYPE_LABELS[h.vitals.bloodType] : "—", Icon: Droplet },
    { label: "Altura", value: h.vitals?.heightCm ? `${h.vitals.heightCm} cm` : "—", Icon: Activity },
    { label: "Peso", value: h.vitals?.weightKg ? `${String(h.vitals.weightKg).replace(".", ",")} kg` : "—", Icon: Activity },
    { label: "IMC", value: imc ? String(imc).replace(".", ",") : "—", Icon: HeartPulse },
  ];

  return (
    <>
      <PageHeader eyebrow="Paciente" title="Mi salud" description="Tu información de salud, organizada por secciones. Completá sólo lo que quieras." />

      <Card className="mb-5">
        <div className="grid grid-cols-2 divide-line border-b border-line sm:grid-cols-4 sm:divide-x">
          {stats.map(({ label, value, Icon }) => (
            <div key={label} className="px-5 py-4 sm:px-6">
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Icon className="size-3.5" /> {label}
              </p>
              <p className="mt-1 text-xl font-semibold tracking-tight text-ink tabular-nums">{value}</p>
            </div>
          ))}
        </div>
        <CardHeader title="Datos básicos" description="Grupo sanguíneo y medidas." />
        <CardBody>
          <VitalsForm
            defaults={{
              bloodType: h.vitals?.bloodType ?? "",
              heightCm: h.vitals?.heightCm ? String(h.vitals.heightCm) : "",
              weightKg: h.vitals?.weightKg ? String(h.vitals.weightKg).replace(".", ",") : "",
            }}
          />
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <EntryCard
          kind="allergy"
          icon={ShieldAlert}
          tone="red"
          items={h.allergies.map((a) => ({
            id: a.id,
            primary: a.name,
            secondary: a.reaction,
            badge: a.severity === "SEVERE" ? { label: "Grave", tone: "red" } : a.severity === "UNKNOWN" ? null : { label: SEVERITY_LABELS[a.severity]!, tone: "amber" },
            source: a.source,
          }))}
        />
        <EntryCard
          kind="condition"
          icon={HeartPulse}
          tone="rose"
          items={h.conditions.map((c) => ({
            id: c.id,
            primary: c.name,
            secondary: join(c.diagnosedOn && `Desde ${formatDate(c.diagnosedOn)}`, c.notes),
            badge: c.status === "RESOLVED" ? { label: "Resuelta", tone: "neutral" } : { label: "Activa", tone: "brand" },
            source: c.source,
          }))}
        />
        <EntryCard
          kind="medication"
          icon={Pill}
          tone="violet"
          items={h.medications.map((m) => ({ id: m.id, primary: m.name, secondary: join(m.dosage, m.frequency, m.startedOn && `Desde ${formatDate(m.startedOn)}`), source: m.source }))}
        />
        <EntryCard
          kind="emergencyContact"
          icon={Phone}
          tone="amber"
          items={h.emergencyContacts.map((c) => ({ id: c.id, primary: c.name, secondary: join(c.relationship, c.phone) }))}
        />
        <EntryCard
          kind="surgery"
          icon={Scissors}
          tone="sky"
          items={h.surgeries.map((s) => ({ id: s.id, primary: s.name, secondary: join(s.performedOn && formatDate(s.performedOn), s.institution?.name, s.notes), source: s.source }))}
        />
        <EntryCard
          kind="hospitalization"
          icon={Hospital}
          tone="slate"
          items={h.hospitalizations.map((x) => ({
            id: x.id,
            primary: x.reason,
            secondary: join(
              x.admittedOn && `${formatDate(x.admittedOn)}${x.dischargedOn ? ` – ${formatDate(x.dischargedOn)}` : ""}`,
              x.institution?.name,
            ),
            source: x.source,
          }))}
        />
        <EntryCard
          kind="vaccination"
          icon={Syringe}
          tone="brand"
          items={h.vaccinations.map((v) => ({ id: v.id, primary: v.name, secondary: join(v.dose, v.administeredOn && formatDate(v.administeredOn)), source: v.source }))}
        />
        <EntryCard
          kind="familyHistory"
          icon={Users}
          tone="slate"
          items={h.familyHistory.map((f) => ({ id: f.id, primary: f.condition, secondary: join(f.relationship, f.notes), source: f.source }))}
        />
      </div>
    </>
  );
}
