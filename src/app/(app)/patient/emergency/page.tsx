import type { Metadata } from "next";
import Link from "next/link";
import { Droplet, Info, Phone, Pill, ShieldAlert, HeartPulse, Siren } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmergencySettingsForm } from "@/features/health/components/emergency-settings-form";
import { BLOOD_TYPE_LABELS, SEVERITY_LABELS } from "@/features/health/config";
import { getHealthOverview } from "@/server/medical/health";
import { requirePatient } from "@/server/patient/context";
import { fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "Información de emergencia" };

function Section({ icon: Icon, title, children }: { icon: typeof Droplet; title: string; children: React.ReactNode }) {
  return (
    <div className="py-3.5 first:pt-0 last:pb-0">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-red-700/80 uppercase">
        <Icon className="size-3.5" /> {title}
      </p>
      <div className="text-sm text-ink">{children}</div>
    </div>
  );
}

const none = <span className="text-muted">Sin datos cargados</span>;

export default async function EmergencyPage() {
  const { user, patientId } = await requirePatient();
  const h = await getHealthOverview(patientId);
  const e = h.emergency;
  const settings = {
    showBloodType: e?.showBloodType ?? true,
    showAllergies: e?.showAllergies ?? true,
    showConditions: e?.showConditions ?? true,
    showMedications: e?.showMedications ?? true,
    showEmergencyContacts: e?.showEmergencyContacts ?? true,
    additionalNotes: e?.additionalNotes ?? "",
  };
  const activeConditions = h.conditions.filter((c) => c.status === "ACTIVE");
  const nothingSelected = !Object.entries(settings).some(([k, v]) => k !== "additionalNotes" && v) && !settings.additionalNotes;

  return (
    <>
      <PageHeader title="Información de emergencia" description="Elegí qué datos vitales conviene tener a mano ante una urgencia." />

      <Alert tone="info" className="mb-6">
        Por ahora esta ficha es privada y sólo la ves vos. Más adelante vas a poder compartirla de forma segura (por ejemplo, con un código QR).
      </Alert>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="¿Qué mostrar?" description="Los datos se toman de Mi salud." />
          <CardBody>
            <EmergencySettingsForm defaults={settings} />
          </CardBody>
        </Card>

        <div>
          <p className="mb-2 px-1 text-xs font-medium text-muted">Vista previa</p>
          <Card className="overflow-hidden border-red-100">
            <div className="flex items-center gap-3 bg-gradient-to-r from-red-600 to-rose-600 px-5 py-4 text-white sm:px-6">
              <Siren className="size-5" />
              <div className="min-w-0">
                <p className="text-xs font-medium tracking-wide text-white/80 uppercase">Ficha de emergencia</p>
                <p className="truncate font-semibold">{fullName(user)}</p>
              </div>
            </div>
            <CardBody className="divide-y divide-line">
              {nothingSelected ? <p className="text-sm text-muted">No elegiste ningún dato para mostrar.</p> : null}
              {settings.showBloodType ? (
                <Section icon={Droplet} title="Grupo sanguíneo">
                  {h.vitals?.bloodType ? <span className="text-2xl font-semibold">{BLOOD_TYPE_LABELS[h.vitals.bloodType]}</span> : none}
                </Section>
              ) : null}
              {settings.showAllergies ? (
                <Section icon={ShieldAlert} title="Alergias">
                  {h.allergies.length ? (
                    <ul className="space-y-1">
                      {h.allergies.map((a) => (
                        <li key={a.id}>
                          <span className="font-medium">{a.name}</span>
                          {a.severity !== "UNKNOWN" ? <span className="text-muted"> · {SEVERITY_LABELS[a.severity]}</span> : null}
                          {a.reaction ? <span className="text-muted"> · {a.reaction}</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    none
                  )}
                </Section>
              ) : null}
              {settings.showConditions ? (
                <Section icon={HeartPulse} title="Patologías">
                  {activeConditions.length ? activeConditions.map((c) => c.name).join(", ") : none}
                </Section>
              ) : null}
              {settings.showMedications ? (
                <Section icon={Pill} title="Medicación">
                  {h.medications.length ? (
                    <ul className="space-y-1">
                      {h.medications.map((m) => (
                        <li key={m.id}>
                          <span className="font-medium">{m.name}</span>
                          {m.dosage || m.frequency ? <span className="text-muted"> · {[m.dosage, m.frequency].filter(Boolean).join(", ")}</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    none
                  )}
                </Section>
              ) : null}
              {settings.showEmergencyContacts ? (
                <Section icon={Phone} title="Contactos">
                  {h.emergencyContacts.length ? (
                    <ul className="space-y-1">
                      {h.emergencyContacts.map((c) => (
                        <li key={c.id}>
                          <span className="font-medium">{c.name}</span>
                          {c.relationship ? <span className="text-muted"> ({c.relationship})</span> : null} · <span className="tabular-nums">{c.phone}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    none
                  )}
                </Section>
              ) : null}
              {settings.additionalNotes ? (
                <Section icon={Info} title="Información adicional">
                  <p className="break-words whitespace-pre-line">{settings.additionalNotes}</p>
                </Section>
              ) : null}
            </CardBody>
          </Card>
          <p className="mt-3 px-1 text-[13px] text-muted">
            ¿Falta algo?{" "}
            <Link href="/patient/health" className="font-medium text-brand-700 hover:text-brand-900">
              Completalo en Mi salud
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
