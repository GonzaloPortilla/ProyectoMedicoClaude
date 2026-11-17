"use client";

import { useActionState } from "react";
import { saveVitalsAction } from "@/features/health/actions";
import { BLOOD_TYPE_LABELS } from "@/features/health/config";
import { initialFormState } from "@/lib/form";
import { Alert } from "@/components/ui/alert";
import { SelectField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function VitalsForm({ defaults }: { defaults: { bloodType: string; heightCm: string; weightKg: string } }) {
  const [state, action] = useActionState(saveVitalsAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = { ...defaults, ...(state.status === "error" ? state.values : {}) };
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message ? <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SelectField label="Grupo sanguíneo" name="bloodType" defaultValue={v.bloodType} error={e.bloodType}>
          <option value="">No sé</option>
          {Object.entries(BLOOD_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextField label="Altura (cm)" name="heightCm" inputMode="numeric" placeholder="170" defaultValue={v.heightCm} error={e.heightCm} />
        <TextField label="Peso (kg)" name="weightKg" inputMode="decimal" placeholder="70,5" defaultValue={v.weightKg} error={e.weightKg} />
      </div>
      <div className="flex justify-end">
        <SubmitButton size="sm" pendingLabel="Guardando…">
          Guardar
        </SubmitButton>
      </div>
    </form>
  );
}
