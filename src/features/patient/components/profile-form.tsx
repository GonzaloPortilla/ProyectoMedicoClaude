"use client";

import { useActionState } from "react";
import { updatePatientProfileAction } from "@/features/patient/actions";
import { SEX_LABELS } from "@/features/patient/schemas";
import { initialFormState } from "@/lib/form";
import { PROVINCES } from "@/lib/jurisdictions";
import { Alert } from "@/components/ui/alert";
import { SelectField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export type ProfileFormDefaults = {
  dateOfBirth: string;
  sex: string;
  documentId: string;
  phone: string;
  province: string;
  city: string;
};

export function PatientProfileForm({ defaults }: { defaults: ProfileFormDefaults }) {
  const [state, action] = useActionState(updatePatientProfileAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = { ...defaults, ...state.values };
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-6" noValidate>
      {state.message ? <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Fecha de nacimiento" name="dateOfBirth" type="date" max={today} min="1900-01-01" defaultValue={v.dateOfBirth} error={e.dateOfBirth} optional />
        <SelectField label="Sexo" name="sex" defaultValue={v.sex} error={e.sex} optional>
          <option value="">Sin especificar</option>
          {Object.entries(SEX_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextField label="Documento (DNI)" name="documentId" inputMode="numeric" autoComplete="off" placeholder="Ej.: 30123456" defaultValue={v.documentId} error={e.documentId} optional />
        <TextField label="Teléfono" name="phone" type="tel" autoComplete="tel" placeholder="Ej.: +54 11 5555-0000" defaultValue={v.phone} error={e.phone} optional />
        <SelectField label="Provincia" name="province" defaultValue={v.province} error={e.province} optional>
          <option value="">Sin especificar</option>
          {PROVINCES.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Ciudad" name="city" autoComplete="address-level2" defaultValue={v.city} error={e.city} optional />
      </div>
      <div className="flex justify-end border-t border-line pt-5">
        <SubmitButton pendingLabel="Guardando…" className="w-full sm:w-auto">
          Guardar cambios
        </SubmitButton>
      </div>
    </form>
  );
}
