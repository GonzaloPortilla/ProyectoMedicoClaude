"use client";

import { useActionState } from "react";
import { saveEmergencySettingsAction } from "@/features/health/actions";
import { initialFormState } from "@/lib/form";
import { Alert } from "@/components/ui/alert";
import { TextAreaField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

type Settings = {
  showBloodType: boolean;
  showAllergies: boolean;
  showConditions: boolean;
  showMedications: boolean;
  showEmergencyContacts: boolean;
  additionalNotes: string;
};

const OPTIONS: { name: keyof Omit<Settings, "additionalNotes">; label: string; hint: string }[] = [
  { name: "showBloodType", label: "Grupo sanguíneo", hint: "Clave ante una transfusión." },
  { name: "showAllergies", label: "Alergias", hint: "Especialmente a medicamentos." },
  { name: "showConditions", label: "Patologías importantes", hint: "Sólo las condiciones activas." },
  { name: "showMedications", label: "Medicación actual", hint: "Para evitar interacciones." },
  { name: "showEmergencyContacts", label: "Contactos de emergencia", hint: "A quién avisar." },
];

export function EmergencySettingsForm({ defaults }: { defaults: Settings }) {
  const [state, action] = useActionState(saveEmergencySettingsAction, initialFormState);
  return (
    <form action={action} className="space-y-5">
      {state.message ? <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert> : null}
      <fieldset>
        <legend className="sr-only">Información a mostrar</legend>
        <ul className="divide-y divide-line rounded-xl ring-1 ring-line ring-inset">
          {OPTIONS.map((o) => (
            <li key={o.name}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{o.label}</p>
                  <p className="text-[13px] text-muted">{o.hint}</p>
                </div>
                <span className="relative inline-flex">
                  <input type="checkbox" name={o.name} defaultChecked={defaults[o.name]} className="peer sr-only" />
                  <span className="h-6 w-10 rounded-full bg-ink/15 transition-colors peer-checked:bg-brand-600 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-500/20" />
                  <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <TextAreaField
        label="Información adicional"
        name="additionalNotes"
        rows={3}
        maxLength={500}
        placeholder="Ej.: Uso marcapasos. Donante de órganos."
        defaultValue={defaults.additionalNotes}
        error={state.fieldErrors?.additionalNotes}
        optional
      />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Guardando…">Guardar preferencias</SubmitButton>
      </div>
    </form>
  );
}
